# サムネイル生成（Thumbnail Generation）

チャート保存時に、D3 の SVG から A4 ランドスケープの PNG サムネイルを自動生成し、
ソーシャルギャラリー（CloudFront/S3）へアップロードして `social_charts.thumbnail` に保存する。
実装は `src/lib/app/FamilyChartEditor.tsx` の `generateThumbnailBlob()`。

## やり方（処理フロー）

1. 画面の `<svg>` を `cloneNode(true)` で複製。
2. 表示中の viewport 矩形（`getVisibleRect()`）を `viewBox` に設定し、`preserveAspectRatio="xMidYMid slice"`
   で A4 に合わせて切り取り（大きな図は一部を鮮明に表示。fit-all はしない）。
   pan/zoom の transform とグリッド/ボード（`.grid-bg` / `.board-border`）はクローンから除去。
3. **スーパーサンプリング**：SVG のラスタライズ解像度を出力の **2倍**（`SS = 2`）に設定
   （`width*SS × height*SS`）。写真やベクタが高解像度でデコードされる。
4. **画像インライン化**（`inlineSvgImages()`）：SVG 内の全 `<image>` の外部URLを
   **canvas 経由で data URL に変換**して差し替える（下記「条件」必須）。
   - `new Image()` に `crossOrigin = 'anonymous'` を付けて読み込み
   - `canvas.drawImage(img)` → `canvas.toDataURL('image/png')`
   - **fetch / Blob は使わない**（`imageUrlToDataUrl()`）。既に `data:` の href はスキップ。
   - 読み込めない画像はスキップ（その1枚だけ従来のシルエット表示＝graceful）。
5. クローンを `XMLSerializer` で文字列化 → base64（CJK対応の `btoa(unescape(encodeURIComponent()))`）
   → `data:image/svg+xml;base64,…` を `new Image()` で読み込み。
6. `canvas`（出力サイズ = A4@DPI）に `imageSmoothingQuality='high'` で `drawImage`（2倍→高品質縮小）。
   背景は**設定した背景色（単色）のみ**塗る（画像は使わない）。
7. `canvas.toBlob('image/png')` → アップロードコールバックで CloudFront/S3 へ。

## なぜ画像インライン化が必要か

SVG を `<img src="data:svg…">` としてラスタライズすると、ブラウザは**セキュリティ上、SVG 内の
外部 href（http/https 画像）を一切読み込まない**。そのため人物写真が欠落し、全ノードが同一の
シルエット代替（`drawPersonSilhouette`）になる。→ 「全員同じ画像／設定した画像でない」現象。
これを防ぐため、ラスタライズ前に画像を data URL 化して SVG を自己完結させる。

## 条件（必須要件）

- **画像ホスト（CloudFront）が CORS を許可していること**（`Access-Control-Allow-Origin` を返す）。
  - 本プロジェクトでは CloudFront/S3 側で CORS/Origin 設定済み（サイトからの画像呼び出しを許可）。
  - CloudFront 設定の要点：Response headers policy で CORS を付与（`SimpleCORS` 等）、
    Cache policy で `Origin` ヘッダをフォワード/キャッシュキーに含める、S3 オリジンにも CORS(GET)。
- CORS が無い場合：`crossOrigin='anonymous'` 読み込み or `toDataURL` が失敗し、
  **canvas 汚染（taint）→ `toBlob` 例外**となるため、クライアント側でのサムネイル生成は不可。
  その場合は該当画像がシルエットのままになる（または要サーバー側生成）。
- **DPI**：既定 150（`② 設定`のスライダー、ホストは環境変数 `NEXT_PUBLIC_CHART_THUMBNAIL_DPI` で上書き可）。
  鮮明さは DPI と**元写真の解像度**にも依存（元画像が小さいと拡大時に限界あり）。

## 設計上の割り切り

- サムネイルの背景は**単色のみ**（背景画像・opacity は反映しない）。安定性優先（外部画像による
  汚染や描画失敗を避ける）。※画面表示・PDF印刷では背景色＋画像＋opacity に対応。
- viewport 切り取り（slice）なので、人物が多い場合は全体ではなく一部が写る。
