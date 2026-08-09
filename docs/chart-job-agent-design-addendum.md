# Chart Job Agent — 設計追補 & レビュー注記 (plan only)

> `docs/chart-job-agent-plan.md`（全体計画）への **レビュー注記＋具体設計の追補**。実装はしない。
> ここで詰めるのは、MVP 着手前に確定すべき 4 点：
> 1. レビュー注記（プランへの指摘と採用する決定）
> 2. **メディア紐づけ junction テーブル**（chart-job / chart ↔ social_media_assets。多数アップロード・役割つき）
> 3. `link-assets` API（worker の S3 成果物 → `social_media_assets` 行 ＋ junction）
> 4. 共有 worker ランタイム（`packages/job-worker-runtime`。claim/lease をコピーしない）
>
> 前提: `docs/architecture/job-runner-feature-playbook.md`（01-ghost-front）、`social-media-gallery` skill、
> `docs/planning/unified-job-framework-plan.md`（統合ジョブ基盤・(B)単一ジョブ多ステップ）。

> ### 2026-08-07 追補（プロジェクト型への改訂）
>
> 全体計画は **プロジェクト型**（汎用 `social_ai_projects` + 単一タイプジョブ +
> `jobs/{jobId}/` と `artifacts/{kind}/` の2層成果物）へ改訂された（plan §0-1 / §2-2）。
> 本書の junction ・link-assets 設計はそのまま有効だが、以下の点が変わる:
>
> | 項目 | 変更 |
> |---|---|
> | リンク対象パス | `chart-jobs/{jobId}/…` → **`chart-jobs/{projectId}/artifacts/{kind}/…`（発行後の安定パス）** |
> | リンクタイミング | ステップ完了時 → **発行（publish）時**（ジョブ完了後に artifacts へ copy してから link-assets） |
> | ジョブの器 | `project_id` 列（plain indexed、null 可 = 既存 MVP ジョブ互換）で **汎用プロジェクト**に所属 |
> | owner_scope | `chartjob` → **`chart_jobs`**（実装済みの名称に訂正） |
>
> 本追補は MVP（実装済み）の設計根拠として残し、プロジェクト型の詳細は全体計画 §2-2 / §3-3 を参照。

---

## 1. レビュー注記（chart-job-agent-plan.md への指摘 → 採用決定）

| # | 指摘 | 採用する決定 |
|---|---|---|
| R1 | 専用 `social_ai_chart_jobs` と統合プランの汎用 `social_ai_jobs` が別路線 | **MVP は専用テーブル**で進む（`steps` JSON ＝合意済み (B)モデル）。ただし**将来 generic へ寄せられる命名**にする（下記 §5） |
| R2 | claim/lease/`generateGhostToken` を chart-worker が**再コピー**（過去に3重複を指摘） | **共有 `packages/job-worker-runtime` を先に切り出し**、chart-worker はそれを使う（§4） |
| R3 | worker→アセット化（gallery表示の肝）が曖昧 | **`link-assets` API を最優先で具体化**（§3）。worker の S3 直書き成果物を Admin JWT で `social_media_assets` 行＋junction に登録 |
| R4 | sample script（fetch/gen/review/normalize）を worker に複製すると二重管理 | **共有モジュール化して worker が参照**（`docs/samples/*.mjs` のロジックを lib 化。MVP は image-fetch のみ先に） |
| R5 | 多入力/多出力の役割が単一 `chart_job_id` 列では表現不足 | **junction テーブルを新設**（§2）。role/person/source_kind を保持（ユーザー要望：アップロード多数のため紐づけ表が必要） |
| R6 | `steps` JSON の肥大化（数千名） | 重いデータは **S3 manifest**、DB `steps` は**軽量 checkpoint（cursor/count）**のみ。per-name 明細は DB に入れない |
| R7 | MVP の「chart へ取込」は暫定 | `social_charts` 統合前は **「ギャラリー表示・選択・DL/ローカル import」まで**を MVP ゴールとする |
| R8 | rerun の下流無効化が過剰 | **部分 payload（`names[]` 等）指定時は下流を無効化しない**。差し替えループは**同一人物の再生成上限**（例:2回）で打ち切り |

---

## 2. メディア紐づけ junction テーブル（本追補の中心）

chart ジョブは **1ジョブで多数のアセット**を扱う（入力=取材素材、出力=CSV/画像/manifest、中間=AI下絵…）。
単一リンク列（`chart_job_id`）では **役割・人物・出所（実写/AI/取材）** を区別できないため、**junction** を新設する。
実績パターンは `estate_property_media`（skill 記載）を踏襲。

### 2-1. `social_ai_chart_job_media`（ジョブ ↔ メディア。多対多・役割つき）

Ghost `schema.js` 記法（additive migration。playbook §4 の FK タイミング罠は junction がジョブ作成後に張るので回避）:

```js
social_ai_chart_job_media: {
    id:           { type: 'string', maxlength: 24, nullable: false, primary: true },
    chart_job_id: { type: 'string', maxlength: 24, nullable: false, index: true,
                    references: 'social_ai_chart_jobs.id', cascadeDelete: true },   // ジョブ削除で紐づけも消える
    media_id:     { type: 'string', maxlength: 24, nullable: false, index: true,
                    references: 'social_media_assets.id', cascadeDelete: true },
    role:         { type: 'string', maxlength: 20, nullable: false, defaultTo: 'output', index: true,
                    validations: { isIn: [['input','source','material','intermediate','preview','output']] } },
    source_kind:  { type: 'string', maxlength: 20, nullable: true },   // real / ai / interview（実写/AI生成/取材素材）
    step_id:      { type: 'string', maxlength: 64,  nullable: true },  // どのステップの入出力か
    person_name:  { type: 'string', maxlength: 191, nullable: true, index: true }, // 人物単位で引ける（画像/取材素材）
    sort_order:   { type: 'integer', nullable: false, unsigned: true, defaultTo: 0 },
    caption:      { type: 'string', maxlength: 2000, nullable: true },
    created_at:   { type: 'dateTime', nullable: false },
    '@@INDEXES@@': [
        ['chart_job_id', 'role', 'sort_order'],   // 「このジョブの output 画像を順に」
        ['chart_job_id', 'person_name'],          // 「織田信長の画像/素材を全部」
        ['media_id']
    ]
},
```

**役割 (`role`) の意味：**

| role | 例 | ステップ |
|---|---|---|
| `input` / `source` | 取込元 CSV、指定ソース | J1/J4 |
| `material` | 取材素材（音声/動画/テキスト/写真） | J8 |
| `intermediate` | AI 下絵・中間 CSV | J6 |
| `preview` | サムネイル・コンタクトシート | J7 |
| `output` | 完成 CSV・採用画像・manifest・chart JSON | J1〜J6 |

これで **ギャラリー（role/person で絞り表示）**・**J7 レビュー（person 単位で画像一覧）**・**J8 取材（person 単位で素材）**・**差し替え（source_kind=ai を実写へ差替）** が同じ表で扱える。

### 2-2. `social_chart_media`（最終チャート ↔ メディア。任意・P後半）

ギャラリーで選択した画像を **チャートの人物に確定採用**したときの紐づけ（チャート単位のメディア管理・再編集用）。
MVP では不要（採用画像URLは `chart_props` の各人物 `image` に入るため）だが、**「このチャートが使っている画像一覧」**を出したくなったら追加：

```js
social_chart_media: {
    id:              { type: 'string', maxlength: 24, nullable: false, primary: true },
    social_chart_id: { type: 'string', maxlength: 24, nullable: false, index: true,
                       references: 'social_charts.id', cascadeDelete: true },
    media_id:        { type: 'string', maxlength: 24, nullable: false, index: true,
                       references: 'social_media_assets.id', cascadeDelete: true },
    person_ref:      { type: 'string', maxlength: 191, nullable: true, index: true }, // チャート内のノード/人物
    role:            { type: 'string', maxlength: 20, nullable: false, defaultTo: 'portrait' },
    sort_order:      { type: 'integer', nullable: false, unsigned: true, defaultTo: 0 },
    created_at:      { type: 'dateTime', nullable: false },
    '@@INDEXES@@': [ ['social_chart_id', 'person_ref'], ['media_id'] ]
},
```

> `social_charts` は host-merge 依存（`docs/host-merge-plan.md`）。未統合の間は `social_chart_media` を作らず、
> チャート側の `image` URL 参照＋ジョブ junction のみで回す。

### 2-3. `social_media_assets` 側

- `owner_scope = 'chart_jobs'` を追加（実装済み。skill の `resolveGalleryScope`/`resolveUploadContext` に分岐）。保存パスは `chart-jobs/{projectId}/artifacts/…`（発行後の安定パス）。
- `chart_job_id` 列（plain indexed、実装済み）に加え、**`project_id` はアセット列として追加しない**（プロジェクト絞り込みは junction → jobs.project_id の join で実現 — 汎用性維持、plan §6-4）。
- `owner_scope` は従来どおり直交して常時セット。

---

## 3. `link-assets` API（worker 成果物 → social_media_assets ＋ junction）

worker は browser session を持たない（gallery presign/finalize 不可）→ **S3 直書き後、Admin JWT で本 API を叩いて行を作る**。
これが「ギャラリーに出す」の実体。

### 3-1. エンドポイント

`POST /social/ai/chart/jobs/:id/link-assets`（Admin JWT。`god_mode` は不要 — Admin キーの integration allowlist が `/social/*` をカバー。`custom-routes.js` に登録）

**Request body:**
```jsonc
{
  "assets": [
    {
      "storage_key":  "chart-jobs/{projectId}/artifacts/images/織田信長.jpg",  // 発行後の安定パス（plan §2-2）
      "storage_url":  "{CHART_JOB_ASSET_HOST}/{projectId}/artifacts/images/織田信長.jpg",
      "asset_type":   "image",           // image/video/audio/text/csv/json（省略時は key から推定）
      "role":         "output",          // §2-1 の role
      "source_kind":  "ai",              // real/ai/interview（任意）
      "step_id":      "{stepId}",
      "person_name":  "織田信長",         // 任意
      "thumbnail_url":"...",             // 任意
      "original_filename": "織田信長.jpg",
      "sort_order":   0
    }
    // …まとめて複数
  ]
}
```

> リンク対象は **artifacts（発行後の安定パス）**。ジョブ作業領域 `jobs/{jobId}/…` は登録しない
> （再実行で参照が壊れないようにするため — plan §2-2 の陳腐化対策）。

### 3-2. ハンドラ挙動

1. ジョブ存在確認（`:id`）。所有者（`user_id`/`group_id`）をアセットの owner に使う。
2. 各 asset について **upsert**（冪等キー = **`storage_key` 単独** — レビュー H1。
   別ジョブによる同一 artifacts パスへの再発行（差し替え上書き）で重複行を作らない）:
   - 既存が無ければ `social_media_assets` に **RAW knex INSERT**（`id=ObjectId()`, `owner_scope='chart_jobs'`,
     `user_id`/`group_id`=ジョブから, `storage_key`/`storage_url`/`asset_type`, `updated_by`=`job.updated_by||user_id`）。
   - あれば `storage_url`/`thumbnail_url` などを更新し、**`chart_job_id` は「最終生成ジョブ」に付け替え**
     （= 最新発行が勝つ。rerun 上書き・差し替え上書きの両方に対応）。
3. `social_ai_chart_job_media` に junction を upsert（**storage_key ベースで置換**。
   `role`/`source_kind`/`step_id`/`person_name`/`sort_order`）。
4. 返り値: 作成/更新した `media_id[]`（worker が `steps[].artifacts` に控える）。

**ルール（playbook 準拠）:**
- **RAW 行**で書く（`toJSON()` は `updated_by` を落とす）。
- **冪等**（**`storage_key` 単独で upsert**。同一 `storage_key` は重複行を作らない）→
  **rerun/上書き/別ジョブ差し替え（H1）で二重登録しない**。`chart_job_id` は最新発行が勝つ。
  ※P1 で unique index を `(chart_job_id, storage_key_hash)` → **`storage_key_hash` 単独**に変更
  （additive migration）。
- 認可: Admin JWT（worker）。ジョブ実在チェックで最低限の防御。**削除系は `/ghost` proxy 経由でユーザー所有権**（playbook §3、host cleanup は「既に消えている時のみ」= IDOR 回避）。
- 削除（job destroy）: `social_ai_chart_job_media`（cascade）→ 参照が無くなった `social_media_assets` 行 ＋ `chart-jobs/{jobId}/` の S3 を明示削除（`ListObjectsV2`+`DeleteObjects`）。

> 補足: 取材素材（J8）は**ブラウザから**（browser session）通常の gallery presign/finalize で上げ、`link-assets` ではなく
> presign 時に `chart_job_id`/role=material を渡す経路もあり得る（§9 未確定）。worker 生成物は `link-assets`、ユーザー手動アップロードは gallery 経由、と使い分け。

---

## 4. 共有 worker ランタイム（`packages/job-worker-runtime`）

chart-worker が claim/lease/JWT を**再コピーしない**ため、統合プラン P2 の共有パッケージを**先に切り出す**（deepzoom も将来これに載せ替え）。

**エクスポート:**
- `generateGhostToken()` / `ghostFetch(path, init)`（Admin JWT、VPC internal host）
- `GhostJobStore(endpointPath)` — `claim()` / `progress(id, {checkpoint})` / `stepComplete(id, stepId, {artifacts})` /
  `stepFail(id, stepId, err)` / `linkAssets(id, assets)` の薄いラッパ（本 chart-jobs のルートを渡すだけ）
- `runJobWorker({ store, process, concurrency=1 })` — poll → claim → lease 更新 → drain のループ。
  空キュー `[[]]` ガード・lease 切れ running の pending 戻し・シグナル終了を内包。

**chart-worker は「処理本体だけ」書く:**
```js
runJobWorker({
  store: GhostJobStore('/social/ai/chart/jobs'),
  concurrency: 1,                       // Wikimedia 429 対策（image-fetch 直列）
  process: async (job, step, ctx) => {
    // ctx: { progress(checkpoint), uploadToS3(key, bytes), linkAssets(assets), llm(prompt) }
    switch (step.type) {
      case 'image-fetch': return imageFetch(job, step, ctx)   // 共有 lib（§R4）を呼ぶ
      // P1+ で csv-create / image-attach / csv-import …
    }
  },
})
```

これで **新ワーカー ≒ `process()` のみ**（統合プランの狙い）。sample ロジック（fetch/gen/review）は共有 lib 化して `process` から呼ぶ（§R4）。

---

## 5. 命名の将来整合（専用 → generic）

MVP は専用 `social_ai_chart_jobs` でよいが、統合プラン（`social_ai_jobs`）へ寄せられるよう命名を合わせておく：

| chart-jobs（今） | generic（統合プラン） | 備考 |
|---|---|---|
| `steps` (JSON) | `state_json` の `steps` | (B) 多ステップの中身 |
| `payload` (JSON) | `input_json` | ジョブ入力 |
| `result` (JSON) | `result_json` | 成果物一覧 |
| `type` | `job_type` | 種別 |
| `social_ai_chart_job_media` | `social_ai_job_media` | junction（generic 化時に `job_id` を汎用ジョブへ） |

→ 将来 generic へ移す場合も **列の意味が1:1** で、移行が機械的。

---

## 6. MVP に落ちる最小セット（この追補分）※MVP は実装済み

MVP（J2 image-fetch 一巡）で**この追補から必要なものは実装済み**（2026-08-07 検証済み）:

1. `social_ai_chart_job_media` junction（migration + schema + model）＋ `owner_scope='chart_jobs'` ✅
2. `link-assets` API 1本（worker 成果物の登録。P1 では **artifacts 安定パス**へ対象変更） ✅
3. `packages/job-worker-runtime`（claim/lease/link-assets ラッパ）＋ chart-worker は `image-fetch` の `process` のみ ✅
4. sample の `fetch-images.mjs` ロジックを共有 lib 化して `process` から呼ぶ ✅

`social_chart_media`（§2-2）・rerun/下流無効化・AI生成・取材は **P1 以降**（プラン §8 のフェーズどおり）。
**P1 の中心はプロジェクト基盤**（`social_ai_projects` + `project_id` + publish + タイプレジストリ — plan §8-P1）。

---

---

## 7. Chart Agent（AI Sidetoolbar 起動口）確定設計 ※実装対象

> 2026-08-08 確定。DeepZoom / Media agent の実フローを実コードで確認し（`agentSurfaceRegistry.tsx` /
> `ToolSidebar.tsx` / `DeepZoomAgentSettingsPanel.tsx` / `MediaAgentSettingsPanel.tsx` /
> `social-gallery.js` presign / chart-worker `storage.js`・`steps/*`）、それに合わせて
> chart ジョブの **起動口を AI Sidetoolbar の "Chart Agent"** に置く。project とも連携する。

### 7-1. 既存パターン（DeepZoom / Media 共通・確認済み）

1. agent ダイアログで **入力（local file / gallery media）＋ AI 用プロンプト**を集める。
2. local を選ぶと **まず presign で gallery(S3) にアップロード**し `storage_url` を得る（`uploadFileWithResult`→`directUploadToSocialGallery`：presign → 直PUT → finalize）。gallery 選択は `GalleryAssetGrid` から既存 URL。
3. その URL を入力に **job を create**。
4. worker が **claim → 入力を container に用意 → 実行 → status 更新 → 結果を job 指定 S3 フォルダへ upload**。
5. ユーザは agent の recent jobs から **job detail** で結果確認。

**Sidetoolbar への agent 追加は 2 ファイル＋パネル1つ**：
`agentSurfaceRegistry.tsx` の `ToolSidebarAgentId` union と `TOOL_SIDEBAR_AGENT_DEFINITIONS` に1行、`ToolSidebar.tsx` の Dialog 本体に `{activeTab==="chart" ? <ChartAgentSettingsPanel/> : null}`。rail は registry を自動反復。

### 7-2. バケットの実態（確認済み・重要）

| 用途 | バケット | キー |
|---|---|---|
| gallery（ユーザーアップロード） | Ghost media adapter（例 `legend-file-upload-240805`） | `gallery/users/{alias}/…` ほか |
| job worker 作業/成果物 | `think-ai-jobs`（`CHART_JOB_S3_BUCKET`\|\|`MEDIA_JOB_S3_BUCKET`） | `chart-jobs/{projectId}/jobs/{jobId}/…`, `chart-jobs/{projectId}/artifacts/{kind}/{name}` |

→ gallery と job は **別バケット**。ただし **host（Next.js）は `think-ai-jobs` への書込資格を既に持つ**（`lib/ai/media/mediaArtifactStore.ts` / `lib/ai/jobs/deepZoomS3Store.ts`）。よって **gallery→job 作業領域のコピーは host のサーバルートで**行う（gallery public URL を GET → `think-ai-jobs` へ PutObject）。

### 7-3. worker 制約（実コードで確定）

- **`csv-import` / `image-attach` は project 必須**（`if (!projectId) throw`）。入力 CSV は
  **`storage.getArtifact(projectId, "artifacts/csv/{name}")` = `chart-jobs/{projectId}/artifacts/csv/{name}`**
  （**project 共有 artifacts 領域**）から読む。→ 入力の置き場は **jobId 不要・projectId だけで決まる**。
- `csv-create` は prompt から AI 生成し job 領域→publish で `artifacts/csv/` へ（standalone 可、project 配下なら下流の csv-import が読める＝パイプライン）。
- `image-fetch` は名前/CSV から画像取得（standalone 可）。

**帰結：入力取り込みは projectId だけで確定 → 先にコピー → 最後に `add`（即 claim 可）で競合ゼロ。chart-jobs backend も worker も変更不要**（`add` は既に `project_id/type/steps/payload` を受ける）。

### 7-4. 確定フロー（local→gallery→URL→job作業領域コピー→add）

```
① project 選択/新規（csv-import・image-attach は必須。csv-create・image-fetch は任意=standalone可）
② 入力CSV:  local → uploadFileWithResult(user-scope gallery) → storage_url
            または gallery 選択(GalleryAssetGrid) → url
③ POST /api/social-ai/chart/prepare-input  { projectId, sourceUrl, kind:"csv", name }
      → host が gallery URL を GET → think-ai-jobs の
         chart-jobs/{projectId}/artifacts/{kind}/{name} へ PutObject
      → { path: "artifacts/csv/{name}" } を返す
④ chart-jobs add:  project_id + type + payload.input_refs=[{kind:"csv", path}]
      → 即 claim 可・入力配置済み = 競合なし
⑤ worker: claim → getArtifact 読取 → 実行 → 結果を job→artifacts publish → link-assets → complete（既存）
⑥ ユーザ: Chart Agent の recent jobs → 既存 app/social-ai/chart-jobs/[id] detail で結果確認
```

csv-create は ②③無し（prompt のみ）→ worker が生成・アップロード（既存）。

### 7-5. Project 連携（Q1=所属は任意）

- Chart Agent は `project_id` 付き（コンテナに追加）／無し（standalone）どちらでも create。
- `csv-import` / `image-attach` は worker 制約上 project 必須なので、UI で project 未選択時はこの2種を選べない（または project 選択を促す）。
- 既存 `app/social-ai/projects/[id]` は複数ジョブ＋成果物（③-1 の artifacts フォルダツリー）を集約するコンテナ。Agent が作った project 付きジョブがここに並ぶ。

### 7-6. 変更ファイル（最小・追加中心。既存/既存API/worker 非破壊）

新規:
- `apps/host/src/components/ai/agents/ChartAgentSettingsPanel.tsx` — 種別選択（内部名＋説明＋分類）／project 選択・新規／入力ピッカー（local→gallery→URL・gallery選択）／prompt／作成／recent jobs＋detail リンク
- `apps/host/src/app/api/social-ai/chart/prepare-input/route.ts` — gallery URL → job 作業領域コピー
- `apps/host/src/lib/ai/chart/chartJobInputStore.ts` — `think-ai-jobs` PutObject（`mediaArtifactStore` 踏襲）

編集:
- `apps/host/src/components/ai/agents/agentSurfaceRegistry.tsx` — `"chart"` を union＋1エントリ
- `apps/host/src/components/ai/panel/ToolSidebar.tsx` — `ChartAgentSettingsPanel` を条件描画
- `apps/host/src/app/social-ai/projects/[id]/page.tsx` — ③-2：同じ入力ピッカー／prepare-input を inline「ジョブ追加」に流用（Agent とロジック共有）

変更なし: **Ghost backend（社内 API）・chart-worker**。

---

---

## 8. 実行時の挙動・LLM・堅牢化（2026-08-09 実装反映）

Chart Agent 実運用で判明した課題への対応。**worker 変更は再起動が必要**（standalone Node プロセスは編集を自動反映しない）。

### 8-1. LLM モデル選択（host と同一の仕組み）

worker は **API キーを一切持たない**。`tools/chart-worker/src/llm.js` の `callLlm` が
host の内部エンドポイント **`POST /api/internal/social-ai/completions`**（`x-social-ai-token: SOCIAL_AI_INTERNAL_TOKEN`）を叩くだけ（media ジョブと同じ keyless 構成）。host 側は **`resolveProviderModel(provider, model)`**（host 自身の `/api/ai/chat` と同一リゾルバ）で解決し `generateText`（`ai` SDK）で実行。

| provider | 既定 model | key |
|---|---|---|
| **deepseek（既定）** | **deepseek-v4-flash** | `DEEPSEEK_API_KEY`（+`DEEPSEEK_BASE_URL`） |
| chatgpt | gpt-4o-mini | `OPENAI_API_KEY` |
| gemini | gemini-2.5-flash | `GEMINI_API_KEY` |
| glm | glm-4.7-flash | `GLM_API_KEY` |
| qwen | qwen-plus | `QWEN_API_KEY` |

- csv-create は provider/model を渡さない → **host 既定（deepseek/deepseek-v4-flash）**。将来は payload に `provider`/`model` を通せば同経路で切替可能。
- 前提 env: host と worker 両方に `SOCIAL_AI_INTERNAL_TOKEN`、host に該当 provider key。未設定なら instruction ジョブは明示的に **失敗**。

### 8-2. csv-create のバッチ生成（長時間OK・進捗・resume）

**課題**：単一 LLM 呼び出しで全人物を生成 → 大人数（例 西遊記）で **worker タイムアウト（旧 300s）超過→失敗**。実測 deepseek-flash ≈ **3秒/人**（15人で約49秒）。

**対応**（`steps/csv-create.js` を image-fetch と同型に改修）：
1. **Phase 1**：`NAME_LIST_SYSTEM` で **対象人物の名前リスト**を生成（高速）。`names.json` に保存＝resume 集合を固定。
2. **Phase 2**：`CSV_GENERATE_SYSTEM` で **小バッチ（既定12名／`CHART_JOB_CSV_BATCH`）ずつ詳細行を生成**。各バッチ後に：
   - `rows.json` を保存（resume）
   - `reportCheckpoint({processed_count, last_name, cursor, total}, %)` で**進捗報告**
   - バッチ間の重複人物（参照相手の再生成等）を `id||name` で除去（最終検証で throw させない）
3. 上限 `MAX_PEOPLE`（既定200／`CHART_JOB_CSV_MAX_PEOPLE`）。名前リスト側で「人数無指定なら主要人物 目安40名以内」とガイド。

**効果**：各 AI 呼び出しが小さい＝**実質タイムアウトしない／ジョブ全体は完了まで走る**。途中経過が UI に出る。中断しても `names.json`/`rows.json`/`cursor` から**続きを再開**。

**空出力ガード**：有効行 0 のとき**黙って空CSVを完了させず失敗**（原因別ヒント。自由文を csv_text 欄に入れた footgun を検知）。

### 8-3. タイムアウト方針

- **per-call 安全網のみ**：`llm.js` の `AbortSignal.timeout(CHART_JOB_LLM_TIMEOUT_MS)`（既定 **600s**）。バッチが小さいので通常発動しない＝「開始後は AI に任せ、基本タイムアウトしない」。
- **ジョブ全体タイムアウトは無し**。claim lease(300s) は **60秒ハートビート＋各バッチ checkpoint** で自動更新され、長時間でも奪われない。

### 8-4. 「実処理中」か「停止」かの判断 + スピナー

worker は running 中、60秒ハートビートと各バッチ checkpoint で `updated_at`／`claim_expires_at` を更新。

| 状態 | 判定 / UI |
|---|---|
| `running` かつ `updated_at` 新しい（≤60s） | **実処理中** → Chart Agent の status を `CircularProgress` で回転＋進捗% |
| `running` で **180s 以上無更新** | **応答待ち（停止の可能性）** → 橙で「応答待ち…Ns 無更新」 |
| `running` で **lease(300s) 超過** | worker 消失 → サーバが再claim可 → 別 worker が **checkpoint から再開** |

### 8-5. 指示プロンプトの保存・修正して再実行

- 指示は `payload.instruction` に**常時保存**。ジョブ詳細（`chart-jobs/[id]`）に「**指示プロンプト（保存済み）**」を表示。
- **「修正して再実行（新規ジョブ）」**：プロンプトを直すと同 project／series を引き継いだ**新 csv-create ジョブ**を作成し詳細へ遷移（失敗・結果不十分時のやり直し導線）。

### 8-6. 付随修正（host 側・§7 実装の不足補完）

- **プロジェクト編集 405**：`/ghost/api/admin/social/ai/*` は next.config の carve-out で **Ghost 直送されず host の Next ハンドラを通る**設計。`app/api/social/ai/projects/[id]/route.ts` に **`PUT`（`editProjectWithAdminToken` 経由）** を追加＋`/ghost/...` 中継で再エクスポート（Ghost backend の edit/PUT は §7 で追加済み → **Ghost 再起動が必要**）。
- **z-index**：Chart Agent は launched dialog 内なので、Select メニューに統一レイヤ `AI_PANEL_Z_INDEX.launchedOverlay`（`components/ai/aiLayering.ts`）を `MenuProps` で付与（未付与だと dialog 背面に出て操作不能）。ネスト dialog（入力ピッカー）も同層。

---

---

## 9. 診断ログ・Docker 方針・UI 導線・resume 厳密化（2026-08-09 追補）

### 9-1. job runner の診断ログ（原因究明用。stdout/stderr ＝ `docker logs` でも同様）

- **`llm.js`**：呼び出し `[llm] → {model} (system=◯字, user=◯字, timeout=◯s, host=…)` / 応答 `[llm] ← {model} ◯ms (content=◯字)`。失敗を**種別判別**：タイムアウト（経過/上限）／接続エラー（host 到達確認）／HTTP status／空応答。
- **`csv-create.js`**：`対象◯名を特定(◯ms)`、各バッチ `◯/◯名 処理（+◯行/累計◯行, ◯ms）`、`names.json から再開`。
- **`runner.js`**：ステップ開始 `step (type) 開始: instruction(◯字)/csv_text/input_refs(◯)/series=…`（入力経路）、完了 `run 完了 ◯ms（publish ◯件）`。
- **タイムアウト配線バグ修正**：`CHART_JOB_LLM_TIMEOUT_MS`（既定600s）を定義したのに fetch が 300s ハードコードのままだった不備を修正（`AbortSignal.timeout(LLM_TIMEOUT_MS)`）。

### 9-2. Docker イメージ方針（media / deepzoom と同一）

**単一の共有イメージ `ghost-media-runner`（`apps/host/.docker/prd.runner.Dockerfile`）に全ワーカーを同梱し、コンテナは同一イメージで `command`（起動スクリプト）だけ切替**。chart-worker は既にこのイメージへ統合済み（deps 導入・`src` コピー・`scripts/run-chart-job-worker.sh`・compose の `chart-job-worker` サービス）。→ worker のコード変更は**イメージ再ビルドで載る**。独立 Dockerfile は方針違反のため作らない。

| サービス | command |
|---|---|
| media-job-runner | 既定 CMD `run-media-job-worker.sh`（`MEDIA_JOB_RUNTIME_MODE=worker`） |
| deepzoom-worker | `run-deepzoom-worker.sh` |
| chart-job-worker | `run-chart-job-worker.sh`（`cd /app/tools/chart-worker && node src/runner.js`） |

**全ランナーは同一イメージ・別コンテナ・同一 EC2** で稼働（`ghost-network`）。**コンテナ化の必須設定**：chart-worker の LLM は host 経由のため、env に **`AI_INTERNAL_BASE_URL=http://ghost-front:3000`（localhost 不可）** と **`SOCIAL_AI_INTERNAL_TOKEN`（host と同一）** を設定。

**package.json スクリプト**（`apps/host`）：`docker:local:up`＝共有イメージのキャッシュビルド→`compose up -d`（全サービス）、`docker:local:chart`＝ビルド→chart-job-worker のみ、`docker:local:down`＝停止、`:only` 系＝再ビルドせず起動のみ、`docker:runner:build:local`＝キャッシュビルド。

### 9-3. UI 導線・件数明記

- **project 遷移リンク**：Chart Agent パネルの recent jobs に `▸ {project名}` リンク追加（ジョブ一覧・詳細は既存）。
- **CSV データ件数を結果に明記**（ジョブ詳細）：生成ファイル一覧に件数 Chip（csv-create=「◯件」／csv-import=「◯人/◯関係」／image-fetch=「画像◯枚」）、ステップ結果にも件数表示。件数は各ステップ `result`（`rows`／`persons`/`relationships`）から。

### 9-4. resume の厳密化（レビュー指摘 MEDIUM の修正）

`generateRowsBatched` の resume で `cursor = acc.length`（生成行数）を使っていたため、バッチが名前数より少ない行を返すと resume 時に一部バッチを再要求（LLM 無駄打ち）。→ `rows.json` を **`{ cursor, rows }` の単一チェックポイント**に変更し **cursor（処理済み名前数）を明示的に永続化**（旧配列形式は後方互換で読込）。出力は元々正しく重複なし・必ず終了（seenKey＋単調増加 cursor）。

### 9-5. 検証

host `tsc --noEmit` エラー0／worker `node --check` 全 OK／独立コードレビュー（13ファイル）で**回帰0・指摘1件（上記 9-4）を修正済み**。非 instruction 経路・LLM ラッパ・runner heartbeat・GET/DELETE ルート・他エージェントはいずれも不変を確認。

---

*本書は設計追補のみ（plan only）。実装は Phase 単位で別途 実装計画を作成する（§7 は実装対象、§8・§9 は実装済みの実行時挙動）。*
