# docs/samples — サンプルデータとツール

このディレクトリには、家系図（family-history-chart）用の**サンプルデータ**と、
それを生成・補完する**ツールスクリプト**が含まれます。

## データ一覧

| シリーズ | 人物CSV | 画像 | 関係図CSV |
|---|---|---|---|
| China（中国） | `01-China/*.csv`（55朝代 + thinkers） | `images/01-China/` | `01-China/china-dynasties.csv` |
| Japan（日本） | `02-Japan/*.csv`（10時代 + thinkers） | `images/02-Japan/` | `02-Japan/japan-eras.csv` |
| West（欧米） | `03-West/*.csv`（12国家 + thinkers） | `images/03-West/` | `03-West/west-states.csv` |

## 画像について

- 実画像（Wikimedia Commons から取得）と AI生成画像（`manifest.json` の `source:"ai"`）の2種類
- 画像ファイル名は CSV の名前と一致（例: `images/02-Japan/紫式部.jpg`）
- 各シリーズの `manifest.json` に出典URL・ライセンス・作者を記録
- **画像の正規の保存場所は `images/` 配下のみ**（CSV直下にはコピーしない・2026-08-07決定）

## ツールスクリプト

| スクリプト | 用途 |
|---|---|
| `fetch-images.mjs` | Wikimedia Commons から人物画像を検索・ダウンロード |
| `fetch-manual.mjs` | ファイル名を確定指定して取得 |
| `fetch-article-images.mjs` | Wikipedia記事のリード画像を取得 |
| `review-images.mjs` | コンタクトシート生成（出鱈目画像の点検用） |
| `cleanup-images.mjs` | 出鱈目画像の削除 + rejected マーク |
| `normalize-manifest.mjs` | manifest.json を名前ごとに1エントリへ正規化 |
| `gen-ai-images.mjs` | 実画像がない人物の肖像を AI（Qwen/GLM）で生成 |
| `gen-*.mjs`（family/japan/west/thinkers/officials） | 人物CSVの生成 |
| `west-trans.mjs` / `west-data.mjs` / `japan-data.mjs` | 西・日の名前翻訳・データ定義 |

## ドキュメント

- **[WORKFLOW.md](./WORKFLOW.md)** — 画像取得・AI生成・関係図CSV作成の**自動処理手順書**（Agent向け）
- 上流のCSV形式仕様: `docs/csv-format.md`（本ディレクトリの親である `docs/` 配下）
