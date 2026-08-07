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

- `owner_scope = 'chartjob'` を追加（skill の `resolveGalleryScope`/`resolveUploadContext` に分岐）。保存パスは `chart-jobs/{jobId}/…`。
- 既存の**単一リンク列は増やさない**（`chart_job_id` 列は作らず、上記 junction に集約）。`owner_scope` は従来どおり直交して常時セット。

---

## 3. `link-assets` API（worker 成果物 → social_media_assets ＋ junction）

worker は browser session を持たない（gallery presign/finalize 不可）→ **S3 直書き後、Admin JWT で本 API を叩いて行を作る**。
これが「ギャラリーに出す」の実体。

### 3-1. エンドポイント

`POST /social/ai/chart/jobs/:id/link-assets`（Admin JWT `&god_mode=true`。`custom-routes.js` に登録）

**Request body:**
```jsonc
{
  "assets": [
    {
      "storage_key":  "chart-jobs/{jobId}/{stepId}/images/織田信長.jpg",
      "storage_url":  "{CHART_JOB_ASSET_HOST}/{jobId}/{stepId}/images/織田信長.jpg",
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

### 3-2. ハンドラ挙動

1. ジョブ存在確認（`:id`）。所有者（`user_id`/`group_id`）をアセットの owner に使う。
2. 各 asset について **upsert**（冪等キー = `chart_job_id` + `storage_key_hash`）:
   - 既存が無ければ `social_media_assets` に **RAW knex INSERT**（`id=ObjectId()`, `owner_scope='chartjob'`,
     `user_id`/`group_id`=ジョブから, `storage_key`/`storage_url`/`asset_type`, `updated_by`=`job.updated_by||user_id`）。
   - あれば `storage_url`/`thumbnail_url` などを更新（rerun 上書き時の再登録に対応）。
3. `social_ai_chart_job_media` に junction を upsert（`role`/`source_kind`/`step_id`/`person_name`/`sort_order`）。
4. 返り値: 作成/更新した `media_id[]`（worker が `steps[].artifacts` に控える）。

**ルール（playbook 準拠）:**
- **RAW 行**で書く（`toJSON()` は `updated_by` を落とす）。
- **冪等**（同一 `storage_key` は重複行を作らない）→ **rerun/上書きで二重登録しない**。
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

## 6. MVP に落ちる最小セット（この追補分）

MVP（J2 image-fetch 一巡）で**この追補から必要なのは**：

1. `social_ai_chart_job_media` junction（migration + schema + model）＋ `owner_scope='chartjob'`
2. `link-assets` API 1本（worker 成果物の登録）
3. `packages/job-worker-runtime`（claim/lease/link-assets ラッパ）＋ chart-worker は `image-fetch` の `process` のみ
4. sample の `fetch-images.mjs` ロジックを共有 lib 化して `process` から呼ぶ

`social_chart_media`（§2-2）・rerun/下流無効化・AI生成・取材は **P1 以降**（プラン §8 のフェーズどおり）。

---

*本書は設計追補のみ（plan only）。実装は Phase 単位で別途 実装計画を作成する。*
