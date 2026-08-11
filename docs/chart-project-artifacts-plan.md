# Chart Project Artifacts — 追加機能 計画（plan only）

対象：social AI chart の **プロジェクト（social_ai_chart_projects）配下のアーティファクト**まわり。
ジョブ単位ではなく **プロジェクト単位**で「見る／入れる／消す」を可能にする。

- HOST: `01-ghost-front/apps/host`（Next.js）
- GHOST backend: `00-Ghost-5.116.2/ghost/core/core/server`
- 実装は Phase 単位。本書は設計のみ（未実装）。作成 2026-08-11。

## 0. 要望（原文の意図）
1. **プロジェクトの gallery を preview 表示**（ジョブ詳細と同じカード component でOK）。
2. **local / user gallery の両方から**、プロジェクトの gallery・csv・json に**アップロード**できる（別 Agent が作った成果物を取り込む目的）。
3. ジョブの `artifacts/images` を適用するとき、**プロジェクトへ copy されるのか？**（＝現状確認）。
4. プロジェクト配下の**全ジョブ artifact をクリア（S3 を空に）**＝プロジェクト完了後に結果を消してスペース節約。

---

## 1. 現状モデル（調査結果・file:line）

### 1-1. ストレージ・レイアウト（`tools/chart-worker/src/storage.js:6-10,102-126`）
```
chart-jobs/{projectId}/jobs/{jobId}/…       WORKING（rerunで上書き。使い捨て）
chart-jobs/{projectId}/artifacts/{kind}/…   PUBLISHED（安定・URL参照される最終物）
```
- `Publish = copy jobs/{jobId}/ → artifacts/{kind}/`（storage.js の説明どおり）。つまり**成果物は公開時点でプロジェクト安定パスに置かれる**。
- 別系統でギャラリー登録キーは `gallery/chart_jobs/{jobId}/…`（media バケット）も存在（job destroy が `%gallery/chart_jobs/{jobId}/%` と `%/jobs/{jobId}/%` を掃除）。

### 1-2. `social_media_assets` に **project_id 列は無い**（`schema.js:1312-1349`）
- 保有列：`storage_key, storage_key_hash, thumbnail_storage_key, asset_type, owner_scope, user_id, group_id, job_id(media), dzi_job_id, chart_job_id, tag_id …`
- **プロジェクト所属は `chart_job_id → social_ai_chart_jobs.project_id` 経由のみ**（資産に直接の project_id が無い）。
- chart 由来資産は `owner_scope='chart_jobs'`、worker 作成行は `user_id=null`。

### 1-3. ギャラリー一覧スコープ（`social-gallery.js`）
- 既存：`user`(1218) / `chartjobs`(1275) / `group`(1324) / `property`(1386)。**project スコープは無い**。
- `chartjobs` は `listByAssetTable({scope:'chart_jobs', chartJobId})`＝1ジョブ単位。IDOR は `chart_job_id→caj.user_id` で担保（`social-gallery.js:728-748`）。

### 1-4. アップロード（`social-gallery.js` presign:1439 / finalize:1586）
- ブラウザ→presign(署名URL)→S3直PUT→finalize で `social_media_assets` 登録。`owner_scope` は uploadContext 由来（`user`/`group` 等）。現状 **chart-project 向けの owner/リンクは無い**。

### 1-5. 破棄時の S3 掃除（実装済みパターン。#4 の下敷き）
- ジョブ destroy（`social-ai-chart-jobs.js:691-755`）：`mediaStore.list({prefix})`→`delete` で `gallery/chart_jobs/{jobId}/` を掃除、`social_media_assets` 行は `%/jobs/{jobId}/%`・`%gallery/chart_jobs/{jobId}/%`（project ジョブは working のみ、legacy は chart_job_id 全部）を削除、junction は FK カスケード。
- プロジェクト destroy（`social-ai-projects.js:399-499`）：子ジョブごとに同様の gallery prefix 掃除＋行削除（`galleryLikes`/`jobAreaLikes`）。

### 1-6. カード component（#1 用）
- `src/components/gallery/GalleryAssetGrid.tsx` ＋ `GalleryAssetCard.tsx`＝**ジョブと同じカード**。`items` を渡すだけで表示。`onToggleSelectItem`/`onDeleteItem`（削除アイコン。§13で追加済み）対応。

---

## 2. 設計方針（推奨：`project_id` 列を追加）

#1/#2/#4 はいずれも「プロジェクト単位で資産を引く／入れる／消す」。資産に project の直リンクが無いのが共通のネックなので、**`social_media_assets` に `project_id`（nullable, index）を追加**するのを推奨（1マイグレーション）。これで3機能が素直になる。
- 代替（列を足さない）：常に `chart_job_id → job.project_id` を join。read は可能だが、**#2 の「ジョブに属さない直アップロード」を project に結び付けられない**（sentinel ジョブが必要）。→ 列追加が正解。

以下、列追加を前提に記述（採否は §5 で確認）。

---

## 3. 各機能の設計

### 3-1. プロジェクト gallery preview（#1）
- **backend**：`social-gallery.js` に `project` スコープ追加（`listByAssetTable({scope:'chart_jobs', projectId})` を拡張し、`project_id = ? OR chart_job_id IN (project の jobs)` で絞る）。IDOR は project 所有者チェック（`resolveProject...` 既存流用）。route：`GET /social/gallery/project?project_id=…`。
- **client**：`ghostApi.getProjectGallery({project_id, type, limit})`。
- **UI**：`projects/[id]/page.tsx` に「ギャラリー」セクションを追加し、`GalleryAssetGrid` で表示（ジョブ詳細と同一カード）。削除アイコン（既存 `deleteChartGalleryAsset`）もそのまま使える。

### 3-2. local / user gallery からプロジェクトへアップロード（#2）
対象種別：**image / csv / json**（別 Agent 成果物の取り込み）。
- **local アップロード**：既存 presign/finalize を **project 対応**に拡張（uploadContext に `projectId` と `ownerScope='chart_jobs'` 相当、保存キーは `chart-jobs/{projectId}/artifacts/{kind}/{name}`、finalize で `project_id` セット）。csv/json も同経路（asset_type=file）。
- **user gallery から取り込み**：ユーザーの既存資産を選び、**プロジェクトへコピー登録**（S3 コピー→`chart-jobs/{projectId}/artifacts/{kind}/` に置き、新 `social_media_assets` 行を project_id 付きで作成）。`prepare-input`（cross-project CSV コピー）と同型の考え方。
- **UI**：`projects/[id]/page.tsx` に「アップロード」導線。タブ **ローカル / ユーザーGallery**（`ChartCsvImportControl` のタブ UI を汎用化して流用）。csv/json はインポータやチャート作成の入力にも使える。
- 補足：csv/json は `artifacts/csv/`・`artifacts/json/`（or `artifacts/data/`）に統一。

### 3-3. ジョブの artifacts/images 適用時に project へ copy されるか（#3 の回答）
- **すでにプロジェクト内にある**。worker の Publish で `jobs/{jobId}/ → chart-jobs/{projectId}/artifacts/{kind}/` に**コピー済み**（storage.js）。登録行 `social_media_assets` はこの安定パスを指し、`chart_job_id→project` でプロジェクトに属する。
- チャートへ「適用」＝物理コピーではなく **`social_chart_media`（chart↔asset）リンク**を張るだけ（重複コピーしない）。
- したがって #3 は「別途 copy 不要（公開時点で project 配下に存在）」。列追加時は published 登録に `project_id` も入れておくと #1/#4 が単純化。

### 3-4. プロジェクトの全ジョブ artifact をクリア（#4・S3 empty）
「完了後にジョブ結果を消してスペース節約」。**消してよい範囲**を明確化：
- **安全に消せる**：作業域 `chart-jobs/{projectId}/jobs/**`（rerun 用の中間物）＋ ギャラリー実体 `gallery/chart_jobs/{各jobId}/**`。
- **既定は温存**：公開安定 `chart-jobs/{projectId}/artifacts/**`（チャートが参照する最終物）。→ 完全削除したい場合は別オプション（`include_artifacts=true`）。
- **backend**：`social-ai-projects.js` に `clearArtifacts` アクション（`POST /social/ai/projects/:id/clear-artifacts`）。所有権＋**active ジョブが無いこと**を確認 → `mediaStore.list/delete` で対象プレフィックスを空に → 対応する `social_media_assets` 行（working／gallery、任意で artifacts）を削除（junction カスケード）→ ジョブ行は残す/`result` を縮約（履歴保持）。
- **UI**：`projects/[id]/page.tsx` に「ジョブ成果をクリア（S3節約）」ボタン＋確認ダイアログ（削除範囲を明示、artifacts 込み削除はチェックボックス）。

---

## 4. 影響・非破壊
- 既存の read/破棄フローは不変（追加中心）。`project_id` 列は nullable＝既存行に影響なし。
- IDOR：全 read/write で project 所有権チェック（既存 helper 流用）。
- backend 変更ありのため **Ghost 再起動**、`project_id` 追加は **マイグレーション**（5.116 versions 配下）。

## 5. 設計判断（2026-08-11 決定）
1. **`social_media_assets.project_id` 列を追加する**（採用）。published 登録・アップロード・クリアで project_id を用いる。
2. **#4 クリアは「媒体（メディア）を削除」**：`chart-jobs/{projectId}/jobs/**`（作業域）＋`gallery/chart_jobs/{jobId}/**`＋**`chart-jobs/{projectId}/artifacts/{images,…}`（メディア成果物）を削除して S3 を空に。→ **削除後はジョブページで成果物を表示しない**（`result.cleared` マーカーで gallery/preview/import/download を隠し「スペース節約のため削除済み」を表示）。`jobs/**` 全体を消す場合は **ジョブ一覧/詳細の表示もその状態に追従**させる。
3. **#2 アップロード種別は将来拡張前提**：当面 image/csv/json、将来 **video / audio / file(docs, pdf 等)**。media job プロジェクト・deepzoom プロジェクトも見据え、**asset_type 非依存の汎用アップロード**にする（3種ハードコードしない）。
4. **#4 後もジョブ行は残す**（`result` を縮約＋`cleared` フラグ）。完了ジョブ削除はしない。

## 6. Phase 分割（案）
- **P1**：`project_id` 列マイグレーション ＋ project gallery スコープ（#1 read）＋ 詳細ページに gallery preview。
- **P2**：アップロード（#2）local→project、次いで user gallery→project。
- **P3**：クリア（#4）working＋gallery、オプションで artifacts。
- （#3 は現状仕様の明文化のみ・実装不要）

---

*本書は計画のみ（plan only）。実装は Phase ごとに着手し、完了分は chart-job-agent-design-addendum.md に実装反映として追記する。*
