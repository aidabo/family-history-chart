# Chart Job Agent — 全体計画（改訂: プロジェクト型）(plan only)

**CSV作成・画像取得・画像CSV取り込み・インポート** などの各作業を、**プロジェクト**（汎用の作業の器）の中で
**ジョブ**（job runner の仕組み）で非同期処理し、出来上がった素材（CSV・画像・manifest）を
**S3（`think-ai-jobs` バケット / `chart-jobs` フォルダ）**にアップロード、ホスト画面の**ギャラリー**から表示・選択して
**家系図チャートへインポート**できるようにする。

> 本書は**全体計画のみ**（実装は Phase 単位で別途 実装計画を作成する）。
> 前提技術は 01-ghost-front の **job-runner-feature** skill（`docs/architecture/job-runner-feature-playbook.md`）と
> **social-media-gallery** skill（`social_media_assets` 中央ギャラリー）に従う。

> ### 2026-08-07 改訂（プロジェクト型へ） — 何が変わったか
>
> 従来案は「1ジョブ = 順序付きステップ配列（強制パイプライン）」だったが、以下の理由で設計変更:
> - ユーザー要件は**自由度**: 任意のジョブタイプを任意の順序・回数で発行・再実行したい
>   （「CSV作って」→ 数日後「画像取得して」→ また修正、という実運用）。強制パイプラインは過剰な制約
> - **ジョブ間の関係が見えない**問題（別ジョブ=別フォルダ・紐づけなし）を解決する必要がある
>
> 新設計:
> 1. **プロジェクト** = 作業の器（汎用テーブル `social_ai_projects`。chart に依存しない）
> 2. **ジョブ = 単一タイプの1回の実行**（タイプレジストリから選択。順序・回数は自由）
> 3. **成果物は2層**: `jobs/{jobId}/`（作業領域・再実行で上書き）と `artifacts/`（公開成果物・安定パス）
>    — 参照は **jobId を含まない安定パス**を指すため、再実行しても参照が壊れない（陳腐化を構造で解決）
> 4. **タイプレジストリ**（ジョブタイプ定義の一覧管理）で新タイプ追加が自動拡張になる
> 5. **標準化**（§0-2）により、家系図に限らない幅広いジョブファミリーに同じ基盤が使える

---

## 0. スコープ / ゴール

- **入力**：ユーザーが「XXのCSVを作って」「画像を取得して」「このCSVをインポートして」と指示
  （チャット Agent 経由 or ジョブ作成フォーム直打ち）
- **出力**：
  1. 完成素材一式（CSV・人物画像・manifest.json）→ **S3 `think-ai-jobs` / `chart-jobs/{projectId}/` フォルダ**に非同期アップロード
  2. ホスト画面の**ギャラリー**に成果物が表示（画像プレビュー・CSV一覧）
  3. ギャラリーで**選択 → チャートへインポート**（既存 chart へのマージ or 新規 chart 作成）
- **非目標（当面）**：完全自動の史実検証、レイアウトの完全自動最適化（人手調整前提）

### 0-1. 概念モデル（改訂の核）

```
プロジェクト（例:「織田家の家系図」）  = 作業の器（名前・説明・タグ。日をまたいで成長し続ける）
 ├── ジョブ: J2 image-fetch    ← 「画像取得」を発行
 ├── ジョブ: J1 csv-create     ← 数日後「CSV作成」を発行（任意の順序・回数）
 ├── ジョブ: J3 image-attach   ← 「取得画像をCSVに取り込み」（入力は artifacts の安定パス）
 ├── ジョブ: J2 image-fetch    ← 「この1名だけ差し替え」で再発行（部分対象指定）
 └── ジョブ: J4 csv-import     ← 「チャートへインポート」
```

- **プロジェクト = ジョブのコンテナ**。全ジョブの成果物が `chart-jobs/{projectId}/` に集約される
  （「アップロードしたものが別々の場所になる」問題の解消）
- **ジョブ = 単一タイプの1回の実行**。状態機械（claim/lease/checkpoint）は既存 playbook をそのまま使う
- パイプラインの強制はしない（= 自由度）。順序はユーザーが選ぶ。
  整合性は「参照 = artifacts の安定パス」という構造で担保する（§2-2）

### 0-2. 標準化の狙い（幅広い使いやすさ）

本設計は「家系図チャート」専用ではなく、**任意の「データ作成 → 素材集め → 加工 → 取り込み」ワークフロー**に
同じ基盤が使えるよう標準化する:

| 標準化項目 | 内容 | 使える範囲 |
|---|---|---|
| **汎用プロジェクト** | `social_ai_projects`（chart 非依存）。ジョブ側の `project_id` 1列で任意のジョブファミリーが紐付く | 家系図に限らず、media_jobs / deepzoom-jobs / 将来の任意ジョブ |
| **2層成果物 + 発行フロー** | `jobs/{jobId}/`（作業）→ `artifacts/{kind}/`（公開）。完了時の発行（copy）は全タイプ共通の契約 | 全ジョブタイプ・全ファミリー |
| **安定パス参照** | 入力参照は `{projectId}/artifacts/{kind}/{name}`（jobId を含まない） | タイプ非依存の共通入力指定 |
| **タイプレジストリ** | タイプ定義（payload スキーマ + UI フォーム）の一覧管理 | 新タイプ追加 = 定義1つ + 処理実装1つ |
| **状態機械・claim/lease/checkpoint** | 既存 playbook の共通ルールを流用 | 全ジョブファミリー共通 |

→ 「チャートジョブ」はこの標準基盤の**最初の採用ファミリー**（`social_ai_chart_jobs`、フォルダ `chart-jobs/`）。
   **汎用化の現実的ステップ**: P1 にて projects ルートは最初から generic パス `/social/ai/projects` で実装済み
   （2026-08-07。destroy のカスケードはファミリーレジストリ `JOB_FAMILIES` を反復 — 第2ファミリー
   （media_jobs 等）は登録エントリを足すだけで destroy も追従する）。`family` 列は未追加
   （事前の過剰一般化はしない — レビュー M11。必要になった時点で追加）。

### 対象ジョブタイプ（タイプレジストリに登録していく）

| # | タイプ | 内容 | 既存の再利用資産 |
|---|---|---|---|
| J1 | `csv-create` | データ調査→CSV作成（名前・肩書・期間・関係） | `docs/samples/gen-*.mjs`（データ定義→CSV生成） |
| J2 | `image-fetch` | Wikimedia Commons から人物画像を検索・取得 | `docs/samples/fetch-images.mjs`（**MVP で実装済み**） |
| J3 | `image-attach` | 取得した画像を CSV に取り込み（画像列/ファイル名 反映） | `fetch-manual.mjs`・`normalize-manifest.mjs` |
| J4 | `csv-import` | CSV をパース→チャートデータへ変換 | `src/lib/utils/csv.ts`（`parseCsvToGraph`） |
| J5 | `re-import` | 既存チャートへの再インポート（マージ/置換） | `src/lib/utils/csv.ts` + `docs/import-schema.md` |
| J6 | `image-generate` | **AI生成**（実画像が無い/不合格の人物の肖像） | `docs/samples/gen-ai-images.mjs`（Qwen優先・GLMフォールバック・地域別スタイル・透かし除去・破損検証） |
| J7 | `image-review` | **人間確認ゲート**（画像を目視判定 → OK/NG。NGは差し替えループへ） | `docs/samples/review-images.mjs`（コンタクトシート生成）+ `cleanup-images.mjs`（reject） |
| J8 | `interview-upload` | **取材素材アップロード**（生きている人物向け。音声/動画/テキスト/写真をジョブに登録 → 以後のステップで利用） | gallery アップロード基盤（`socialGalleryDirectUpload.ts`） |
| J9 | `interview-prep` | **インタビュー質問・チェックポイント生成**（人物の経歴・紹介から、取材で確認すべき質問とチェック項目を AI 生成） | `gen-ai-images.mjs` と同方式の LLM API 直接呼び出し（DeepSeek 等） |

---

## 1. 現状把握（既存資産）

### 1-1. job-runner 基盤（01-ghost-front / 00-Ghost）※本計画の土台
- `social_ai_<name>_jobs` テーブル + `api/endpoints/social-ai-<name>-jobs.js`
  （browse/read/add/claim/progress/complete/fail/cancel/delete、`social-ai-dzi-jobs.js` を雛形に）
- **ハードルール**（playbook §2–5、破ってはいけない）:
  - **Atomic claim + lease**：`queued→running` の条件付き UPDATE + `claim_expires_at`。
    progress 毎に lease を延長（5分超ジョブの二重claim防止）
  - **空キューclaim**は `{"<name>jobs":[[]]}` で返る → 先頭要素ガード必須
  - 更新系は RAW knex 行（`toJSON()` は `updated_by` を落とす）
  - アセット⇔ジョブのリンク列は **plain indexed column（FKにしない）**
  - アップロードは gallery presign/finalize（browser session 必須）、
    worker は Admin JWT `&god_mode=true`（social gallery は不可）
  - S3 アップロードエラーは握りつぶさない（存在チェックのみ catch）

### 1-2. ストレージ/配信
- 既存: `MEDIA_JOB_S3_BUCKET=think-ai-jobs`（jobs 用）+ gallery バケットの2系統。
  **本計画は既存の `think-ai-jobs` バケット内に `chart-jobs` フォルダを追加**（media-jobs / deepzoom-jobs と同様）
- 配信: CloudFront `{ASSET_HOST}/{projectId}/…`（ASSET_HOST は prefix 込み）
- 環境変数パターン（playbook §6 踏襲）:
  `CHART_JOB_STORAGE_BACKEND`（filesystem/s3）・`CHART_JOB_S3_BUCKET=think-ai-jobs`（既存）・
  `CHART_JOB_S3_PREFIX=chart-jobs`・`CHART_JOB_ASSET_HOST`・`CHART_JOB_ROOT_DIR`

### 1-3. ギャラリー（social_media_assets）※表示・選択 UI の土台
- **中央メディアテーブル**: `social_media_assets`（storage_key/url・asset_type・owner_scope・user/group）
- **owner_scope 追加パターン**（skill 記載）: `resolveGalleryScope` + `resolveUploadContext` に分岐追加
  → 本計画では `chart_jobs` scope を追加（MVP で実装済み）
- リンクパターン: **plain indexed column**（`dzi_job_id` の踏襲 → `chart_job_id`、実装済み）
  + **junction `social_ai_chart_job_media`**（role/source_kind/step_id/person_name — 多数アップロード・役割つき紐づけ、MVP で実装済み）
- 既存UI: `apps/host/src/components/gallery/`（`GalleryAssetGrid`・`GalleryAssetCard`）、`app/gallery`

### 1-4. チャート側（12-family-history-chart）
- **CSV取込**: `src/lib/utils/csv.ts`（`parseCsvToGraph` / `graphToCsv`）、仕様 `docs/csv-format.md`
- **JSON取込**: `docs/import-schema.md`（persons/relationships、マージ動作）
- **サンプル資産**: `docs/samples/` の 3シリーズ CSV + `images/{01-China,02-Japan,03-West}/` + manifest.json
  + 全ツール（fetch/gen/review/cleanup/normalize）
- **作業手順書**: `docs/samples/WORKFLOW.md`（0.データ準備→1.画像パイプライン→2.関係図CSV→3.チェックリスト）
  → **ジョブタイプの仕様はこれを機械化する**
- **関連計画**: `docs/ai-person-agent-plan.md`（family-chart-agent）、`docs/host-merge-plan.md`（social_charts 統合）

---

## 2. 全体アーキテクチャ（プロジェクト型）

```
[ユーザー] ── 指示 ──→ [host画面: プロジェクト詳細（ジョブ発行フォーム）or チャット(chart-job-agent)]
                              │ タイプレジストリからタイプ選択 → payload 入力（参照は artifacts 安定パス）
                              ▼
                    POST /ghost/api/admin/social/ai/chart/jobs/add  (project_id 付き)
                              ▼
              [Ghost] social_ai_chart_jobs  (queued)
                              ▲ claim (Admin JWT)
                              │
              [chart-worker] ─┴─  standalone worker (EC2/Docker, 01-ghost-front tools/)
                              │  タイプ実装（J1~J7）を実行 → jobs/{jobId}/ に書き込み
                              │  progress 毎に lease 延長 + チェックポイント保存
                              │  完了時: artifacts/ へ copy（発行）+ アセット登録
                              ▼
        [S3 chart-jobs]  chart-jobs/{projectId}/jobs/{jobId}/… + artifacts/{kind}/…
                              │
        ┌─────────────────────┼──────────────────────────┐
        ▼                     ▼                          ▼
  [publish 時に asset リンク]  [CloudFront 配信]       [画面: プロジェクト一覧/詳細]
  social_media_assets          {ASSET_HOST}/{projectId}/…   ポーリングで進捗表示
  (owner_scope=chart_jobs,                              jobs タイムライン + artifacts 一覧
   参照は artifacts の安定URL)
                              │
                              ▼
        [ギャラリーUI] 表示（画像プレビュー・CSV一覧）→ 選択
                              ▼
        [インポート] 選択した素材 → chart へ (csv.ts parseCsvToGraph / import-schema)
                    → 新規 chart 作成 or 既存 chart へマージ（再インポート）
```

### 2-1. 設計上の主要決定（playbook 踏襲 + 改訂）

| 項目 | 決定 | 理由 |
|---|---|---|
| 作業の器 | **プロジェクト**（`social_ai_projects`。汎用・chart 非依存） | 任意タイプを任意順序で発行する自由度 + 全成果物の一元管理 |
| ジョブ粒度 | **1ジョブ = 単一タイプの1回の実行** | 強制パイプラインは過剰制約。順序・回数はユーザー選択 |
| Worker 方式 | **standalone**（deepzoom 方式、Next bundle 不要） | 全ジョブが外部HTTPのみ（Wikimedia API・DashScope/GLM API・Ghost API）。`lib/ai/**` 不要 |
| Job テーブル | `social_ai_chart_jobs`（実装済み）+ **`project_id` 列追加** | playbook §2 準拠。`steps` 配列は実装継承で維持（1要素=タイプ本体。タイプ内サブステップは後で拡張可） |
| バケット | **`think-ai-jobs` 既存** + prefix `chart-jobs/`（=ファミリー名） | media-jobs / deepzoom-jobs と同様。プロジェクトは `chart-jobs/{projectId}/` 配下 |
| 成果物 2層 | `jobs/{jobId}/`（作業）+ `artifacts/{kind}/`（公開・安定パス） | 参照の陳腐化を構造で解決（§2-2）。旧版は jobs/ に残り復元可能 |
| アセットリンク | `social_media_assets.chart_job_id`（plain indexed、FK無し、実装済み）+ junction | アップロードが job 行より先 → FK は必ず null 化（playbook §4 の罠） |
| 参照契約 | 入力参照は `artifacts/{kind}/{name}`（jobId を含まない） | 再実行（別 jobId）でも参照パス不変 → 壊れない |
| owner_scope | `chart_jobs` を追加（実装済み） | ギャラリー一覧を他 scope と分離 |
| ギャラリー表示 | 既存 `components/gallery/` を scope フィルタで再利用 + プロジェクトフィルタ | 新規UIを作らない |
| インポート | host 統合済みなら `DataProvider` 経由、未統合ならダウンロード→ローカル import | host-merge-plan の進捗に依存 |

### 2-2. プロジェクト・ジョブ・成果物モデル（改訂の核）

#### プロジェクトの状態（ジョブから導出）

```
ジョブが無い          → draft（下書き）
未完ジョブあり         → active（進行中。日をまたいで続行可能）
全ジョブ完了          → completed
```

「プロジェクトを完了に戻す」操作は不要 — 新しいジョブを発行すると自動的に active へ戻る
（= 数日・数週間後でも「続き」を同じプロジェクトで再開できる）。

#### ジョブの状態機械（既存 playbook 踏襲）

```
queued ──claim──→ running ──complete──→ completed
   ▲                   │
   │                   └──確認待ち──→ waiting_review ──approve──→ completed
   │                                                          └──reject──→ queued（差し替え後再確認）
   └──── 失敗 ────→ failed ──rerun──→ queued
   └──── 再実行要求 ──→ queued
```

> **`waiting_review`（確認待ち）は claim 対象外・lease 切れ戻しの対象外**（レビュー H2、P1 で確定）。
> `running` のまま停止するとランタイムの「lease 切れ running の pending 戻し」で再実行されるため。

- レジューム（中断→別日→続き）: ジョブは**単一タイプ**なので、再claimで続きから。
  長いタイプ（image-fetch 数千名）は**ステップ内チェックポイント**（1名ごとに
  `progress: {processed_count, last_name, cursor}` を Ghost に保存）→ 中断後も N+1 番目から再開
- 再実行（rerun）: 当該ジョブを queued に戻す。**部分対象**（`names[]` 等）を payload で指定できる
  （例:「この1名だけ差し替え」）。**下流の自動無効化はしない**（自由度優先。
  整合性は「参照=安定パス」で担保 — 下記）
- 人間確認ゲート（J7 `image-review`）: ジョブは **`waiting_review`**（確認待ち）で停止する
  （claim 対象外・lease 切れ戻しの対象外。worker は進めない — 人が UI で判定するまで）。
  判定結果を `result` に保存
  - `{approved: true}` → 完了 → 発行（artifacts へ）
  - `{approved: false, ng_names: [...], action: "ai-regen"|"refetch"}` → 差し替えジョブ
    （`image-generate` or `image-fetch` の部分対象）を**同じプロジェクトに発行** → 再確認
  - 差し替えループは**同一人物の再生成上限**（例:2回）で打ち切り（§9 未確定 → P2 で確定）

#### 成果物 2層（jobs/ + artifacts/）— 陳腐化対策の本質

```
chart-jobs/{projectId}/
├── jobs/{jobId}/…                # 作業領域: その実行が作ったもの（再実行で上書き・置き場）
└── artifacts/{kind}/{name}       # 公開成果物: 参照・ギャラリー表示の対象（安定パス）
```

| 層 | 役割 | ライフサイクル |
|---|---|---|
| `jobs/{jobId}/` | 各実行の生の成果物（デバッグ・旧版復元用） | ジョブ削除と一緒に消える |
| `artifacts/` | **最新の公開版**。ギャラリー・参照・インポートはここを見る | ジョブ完了時に copy で更新（発行） |

- **発行（publish）**: ジョブ正常完了時に worker が `jobs/{jobId}/` → `artifacts/{kind}/` へ
  **copy**（S3 CopyObject / filesystem copy）+ プロジェクト manifest 更新 + アセット登録
  - **順序: publish → stepComplete**（complete 前に発行が済む。publish 失敗 = ジョブ fail、
    jobs/ は残る → rerun で再挑戦 — レビュー M1）
  - **一貫性**: 画像セット等の複数オブジェクトは**一時 prefix への一括 copy → manifest 更新**の順で
    発行し、**read 側は manifest 起点で解決**する（新旧混在を見せない — レビュー M6）
  - copy にする理由: ①S3 に move は無い（copy+delete の2操作） ②各実行の成果物が jobs/ に残り
    **旧版の復元が可能**（§9-9 の未確定事項も同時解決）
- **artifacts 内は種類別フォルダ**（`csv/` `images/` `chart/` `interview/` …）— **jobId を入れない**
  - 参照は `artifacts/csv/織田家.csv` のように **jobId を含まない安定パス**
  - 再実行が「別のジョブ行」（別 jobId）になっても参照先パスは不変 → **参照は永遠に壊れない**
  - 同一名の再発行 = 上書き = 「最新版」に更新。旧版は `jobs/{旧jobId}/` に残る
- **入力参照**: ジョブ発行時に「入力にする成果物」をプロジェクト内 artifacts から明示選択
  （例: image-attach は `artifacts/csv/織田家.csv` を入力にする）。発行時に存在チェック
  - 参照の記録: `steps[].payload` に `input_refs: [{kind, path, ref_updated_at, file_hash}]` として保存
    （**発行時点の版をスナップショット**。artifacts は上書き更新されるため、path だけでは
    「ジョブ作成時点の版」を復元・比較できない — レビュー M4）
  - **参照はファイル単位で固定記録**する（実行時に manifest を展開して解決。ディレクトリ参照は
    記録が残らないため使わない — レビュー M5）
  - UI で「どのジョブがどの成果物を入力にしたか」の参照を表示（ジョブ間の関係が見える）
  - 「参照元が更新されたジョブ」（`ref_updated_at` と現在の manifest の更新日時が不一致）を
    ジョブ一覧・詳細で**見える化**（§9-11。自動無効化はしない）
- **manifest**: プロジェクト単位の `artifacts/manifest.json`（全アーティファクトの
  name/kind/file/source/license/artist/updated_at/job_id を集約）を発行のたびに更新
  → ギャラリー・インポート・確認画面の単一ソース

#### 単発ジョブとの違い（docs/samples のスクリプトと比較）

| | 従来（単発スクリプト） | 本設計（プロジェクト + ジョブ） |
|---|---|---|
| 粒度 | 1コマンド=1処理 | プロジェクト内でタイプ別ジョブ（自由な順序・回数） |
| 中断 | 途中死＝最初から or 手動再開 | ジョブ単位 + チェックポイントで自動再開 |
| 再実行 | 手動で別コマンド（rej モード等） | ジョブ rerun（部分対象指定可） |
| 状態 | なし（ファイル manifest のみ） | Ghost DB にジョブ状態が永続 |
| 成果物 | ローカル/固定フォルダ | `chart-jobs/{projectId}/jobs/{jobId}/` + `artifacts/`（S3） |
| ジョブ間の関係 | なし | **プロジェクト + artifacts 安定パス参照**で可視化 |

---

## 3. バックエンド設計（00-Ghost）— テーブル + エンドポイント

### 3-1. `social_ai_projects` テーブル（新規・additive migration）

**汎用**（chart 非依存）: 任意のジョブファミリーが `project_id` で紐付けられる。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | 24-char ObjectId | PK |
| `name` | string | 作業名（例:「織田家の家系図」） |
| `description` | string(2000) | 説明（任意） |
| `tags` | longtext JSON | タグ配列（`series: 01-China` 等もタグとして表現 — 汎用性のため固定列にしない） |
| `status` | string | draft / active / completed（**ジョブから導出**、§2-2。更新はジョブ状態遷移の全エンドポイント（add/complete/fail/cancel/rerun/destroy）が呼ぶ共通ヘルパ `recalcProjectStatus(projectId)` で行う — レビュー M2） |
| `user_id` / `group_id` / `updated_by` | string | 所有・監査 |
| `created_at` / `updated_at` | datetime | — |

### 3-2. `social_ai_chart_jobs` テーブル（既存 + `project_id` 列追加）

| カラム | 型 | 説明 |
|---|---|---|
| `id` | 24-char ObjectId | PK |
| `type` | string | ジョブタイプ（`image-fetch` 等 — タイプレジストリの key） |
| `steps` | longtext JSON | 実装継承で維持（1要素 = タイプ本体。`{id, type, status, payload, result, artifacts[], error, history[]}`） |
| `status` | string | queued / running / completed / failed / cancelled |
| `payload` | longtext JSON | ジョブ入力（対象名・CSV参照・オプション等。**`input_refs[]` を含む** — §2-2） |
| `result` | longtext JSON | 成果物一覧（`{project_id, files[], csv_url, manifest_url, image_count…}`） |
| **`project_id`** | string（**plain indexed column、FK 無し**） | 所属プロジェクト。**null 可**（既存 MVP ジョブ互換） |
| `source_path` / `preview_url` | string | アセットリンク用（playbook §4） |
| `input_file_name` | string | 元ファイル名（playbook §11 命名規則） |
| `error` | string | fail 時のメッセージ |
| `claim_worker_id` / `claim_expires_at` | string/date | claim lease |
| `user_id` / `group_id` / `updated_by` | string | 所有・監査 |
| `created_at` / `updated_at` | datetime | — |

### 3-3. エンドポイント

> **認証モデル（2026-08-07 確定 — docs/architecture/decisions.md #8/#19/#21 準拠）**:
> 2つの実行コンテキストを使い分ける。
> - **ホスト Web（ブラウザ UI・AI チャットからのジョブ起動）**: `/ghost/api/admin/social/ai/*`（ghost-path
>   carve-out → ホストの thin re-export → 実ハンドラーが **Cookie を Ghost に転送**。Ghost がセッションから
>   ユーザーを解決し、H3 の user スコープ browse フィルタ・所有チェック・**write 権限チェック（destroy/
>   cancel/rerun）**が機能する。`/api/social/ai/*`（非 ghost-path）への直接アクセスは 401。
> - **worker（job runner）**: ghost-path は**使わない**。Admin JWT（integration）で Ghost に直接アクセス
>   （`tools/chart-worker/.env` の `GHOST_ADMIN_API_KEY`）。user はシステム（Context.user null）→
>   claim/progress/complete 等の worker 専用アクションは integration として実行。
>
> **重要**: Ghost の `authenticateAdminApi = [apiKeyAuth, session]` では Authorization ヘッダー（JWT）が
> セッションより優先されるため、**cookie を転送する呼び出しには Authorization ヘッダーを付けない**
> （`services/ghost/adminAuthHeaders.ts` の `buildAuthHeaders` が実装）。

**プロジェクト（新規）:**

| ルート | 用途 | 注意 |
|---|---|---|
| `GET /social/ai/projects` | browse（user_id で絞り込み — H3 パターン踏襲） | `tags` は JSON 文字列 |
| `POST /social/ai/projects` | add | `status` はサーバーが導出（draft で作成）。**ブラウザセッション必須**（2026-08-07 — ホスト Web は `/ghost/api/admin/social/ai/*` 経由で cookie 転送。Ghost がユーザー解決 → ユーザー所有になる。worker のみ Admin JWT で integration 実行） |
| `GET /social/ai/projects/:id` | read（ジョブ概要一覧を同梱可） | — |
| `DELETE /social/ai/projects/:id` | destroy | **カスケード削除**（ファミリーレジストリ反復 + トランザクション）。実行中ジョブがある場合は 409 拒否。**write 権限必須**（レビュー 2026-08-07） |

**P1 の認可方針（所有権 — レビュー M8）:**
- ジョブ作成時: 指定 `project_id` の所有（user_id / group_id）と一致しなければ拒否
- jobs browse（project_id フィルタ）: プロジェクト所有と join して絞り込み（IDOR 防止）
- ギャラリー: owner_scope=`chart_jobs` + 所有一致（既存規則踏襲）
- group 共有: `group_id` 一致で許可

**ジョブ（既存 + 変更）:**

| ルート | 用途 | 変更 |
|---|---|---|
| `GET /social/ai/chart/jobs` | browse | **`project_id` フィルタ追加** |
| `GET /social/ai/chart/jobs/:id` | read | —（既存） |
| `POST /social/ai/chart/jobs` | add | **`project_id` 受付**（任意・所有チェック）+ `input_refs` の存在チェック（artifacts パス）+ `type` 列と `steps[].type` の一致チェック（レビュー L5） |
| `POST /social/ai/chart/jobs/claim` | atomic claim | —（既存。最初の pending ステップ=タイプ本体） |
| `POST /social/ai/chart/jobs/:id/progress` | progress + lease 延長 | —（既存。チェックポイント保存） |
| `POST /social/ai/chart/jobs/:id/steps/:stepId/complete` | ステップ完了 | —（既存） |
| `POST /social/ai/chart/jobs/:id/steps/:stepId/fail` | ステップ失敗 | —（既存） |
| `POST /social/ai/chart/jobs/:id/steps/:stepId/rerun` | ジョブ再実行 | —（既存。当該ジョブを queued へ。payload で部分対象指定） |
| `POST /social/ai/chart/jobs/:id/cancel` | キャンセル | —（既存） |
| `DELETE /social/ai/chart/jobs/:id` | 削除 | —（既存: 行 + asset 行 + `jobs/{jobId}/` の S3） |
| `POST /social/ai/chart/jobs/:id/link-assets` | アセット登録 | **登録対象は artifacts（安定）URL**。**冪等キーは `storage_key` 単独**（同一 artifacts パスへの別ジョブ再発行で重複行を作らない — レビュー H1） |

**注意**: Ghost は endpoint 変更をホットリロードしない → 追加後は Ghost 再起動必須。

---

## 4. Worker 設計（01-ghost-front `tools/chart-worker/`）

### 4-1. 構成（タイプレジストリ対応）

```
tools/chart-worker/
├── package.json          # standalone（yarn workspace 非メンバー。deps は Docker deps stage で install）
├── runner.js             # Ghost claim ポーリングループ（Admin JWT）— 実装済み
├── type-registry.js      # タイプ定義の一覧（id/表示名/payload 検証/処理関数へのマップ）
└── steps/
    ├── image-fetch.js    # J2: Wikimedia 検索・DL（実装済み）
    ├── csv-create.js     # J1: データ調査→CSV生成（P1）
    ├── image-attach.js   # J3: 画像→CSV取り込み（P1）
    ├── csv-import.js     # J4: CSV→chart JSON（P1）
    └── re-import.js      # J5: 既存 chart へのマージ/置換（P1〜）
```

### 4-2. 処理ループ（ジョブ単位・中断再開対応）

```
loop:
  claim → { job, step = 最初の pending }        # 実行すべきものが無ければ sleep
  step.status = running（progress に checkpoint を保存しながら処理）
  入力参照（input_refs）の存在チェック → 無ければ fail（明確なエラー）
  タイプ実装 → chart-jobs/{projectId}/jobs/{jobId}/ に書き込み
  publish（成功時のみ）: jobs/{jobId}/ → artifacts/{kind}/ へ copy
                + プロジェクト manifest 更新 + link-assets（artifacts URL）
  publish 成功 → steps/:stepId/complete        # 失敗は fail → jobs/ は残る → rerun
```

- **1 claim = 1 ジョブ**。長いタイプ（image-fetch）は内部で checkpoint を保存しながら処理し、
  **中断 → 翌日再開 → N+1 番目から続行**
- ジョブ完了後に worker は次の claim をすぐ行う（同一プロジェクトの別ジョブ or 別プロジェクト）
- 途中でプロセスが落ちても何も失われない — 次回 claim で続きから再開される
- **manifest 競合対策**（過去の教訓）: タイプ再開時は S3 の manifest を再読込してから続行

### 4-3. 各タイプの仕様（共通: 発行フロー）

> **作業指示プロンプト（`instruction`）— P1.5 設計（2026-08-07 確定方針）**:
> ジョブは**別ジョブのまま独立**しつつ、**各ジョブが作業指示プロンプトを受け取れる**実行単位とする。
> - **payload 共通フィールド `instruction`**（任意・自然言語）: 「織田家のCSVを作って、父・母・配偶者を含めて」
>   等をそのまま受け取る。構造化フィールドと併用可（**明示された値は AI に上書きさせない** — AI は
>   指示の曖昧な部分だけを埋める）。
> - **解釈は「実行時（worker）」**: 発行時ではなく。ジョブ記録（payload）に指示が残る → タイムラインに
>   表示でき、再実行時も指示のまま使える（「画像だけ再取得」は instruction を絞って再発行）。
> - **LLM 呼び出しはホストの既存 AI API を経由**（media jobs の本番構成と同じ。ユーザー方針 2026-08-07）:
>   worker は LLM キーを持たず、ホストの AI エンドポイント（例: `/api/ai/*` の既存経路）を
>   internal トークンで呼ぶ。**既存の AI API は修正しない** — 新規の internal 経路（media jobs の
>   `/api/internal/media-jobs/*` と同型）を追加する。
> - **タイプごとの解釈**:
>   - `csv-create`: 「XX家のCSVを作って…」→ AI が**データ自体を調査・生成**（J1 本格版。現行の簡易版は
>     貼り付け CSV の正規化のみ）
>   - `image-fetch`: input_refs / instruction から names[] を抽出
>   - `image-attach` / `csv-import`: 指示は軽微（入力参照解決）— instruction は記録として保持
> - **UI**: 発行フォームに「作業指示プロンプト」欄（タイプ選択と併用・任意）。プロンプトからのタイプ
>   自動推定は P4 のチャット統合に委ねる。
> - **実装フェーズ**: P1.5（P1 の動作確認が落ち着いた後）。worker の JOB_TYPES は変更不要
>   （run 実装内で instruction 分岐を追加）。

**全タイプ共通の「発行（publish）」ステップ（publish.js に共通化）:**
1. `jobs/{projectId}/{jobId}/` の成果物を列挙
2. **一時 prefix（例: `artifacts/.tmp/{jobId}/`）へ一括 copy** → 成功確認後に確定
   （複数オブジェクトの新旧混在を防ぐ。read 側は manifest 起点で解決 — レビュー M6）
3. 種類別フォルダへ確定: `artifacts/{kind}/{name}`（kind はタイプ定義で指定）
   - J1/J3: `csv/`・J2/J6: `images/`・J4/J5: `chart/`・J8: `interview/{person}/`・J9: `interview/`
4. `artifacts/manifest.json` を更新（name/kind/file/source/license/artist/updated_at/job_id を集約。
   read-modify-write は単一 worker 前提。将来の複数 worker 運用では versioning/ETag — レビュー L4）
5. `link-assets`（artifacts の安定 URL でアセット登録 + junction）
6. **publish 成功後に stepComplete**（失敗時は発行しない。jobs/ の成果物は残る → rerun — レビュー M1）

**J1 `csv-create`**
- payload: `{series, subjects[], include_columns, ai: {model, api_key_ref}}`
- タイプ: ①データ取得（Wikipedia API / 指定ソース）→ ②`docs/csv-format.md` 形式でCSV組立
  → ③検証（重複0・ファントム参照0・期間形式）→ ④発行
- 検証チェックは WORKFLOW.md §0-4 のコマンドを node 化
- **AI 生成が必要な場合**（調査を LLM に委ねる）: worker から DashScope/DeepSeek API を直接叩く
  （standalone のまま。`lib/ai/**` は不要）

**J2 `image-fetch`（MVP 実装済み）**
- payload: `{names[] or csv 参照, series, commons_query_mode}`（`names[]` 指定で**部分再実行**に対応）
- タイプ: `fetch-images.mjs` のロジック（完全一致クォート検索→imageinfo→DL→manifest 更新）
- **チェックポイント**: 1名処理ごとに `progress` を Ghost に保存 → 中断後も N+1 番目から再開
- **制約（WORKFLOW.md 環境メモ）**: Wikimedia は同一IP並行プロセスで 429 → **ジョブは1つずつ直列**
  （worker 内セマフォ or Ghost claim の並列数=1 で担保）
- 429 適応ペース・リトライ・ジッターはスクリプトの実装をそのまま移す
- **再実行**: `names[]` を絞って rerun すると、指定名のみ再検索（特定人物の差し替えフロー）
- 発行: `images/` + プロジェクト manifest 更新

**J3 `image-attach`**
- payload: `{input_refs: [{kind:"csv", path:"artifacts/csv/織田家.csv"}], 画像参照}` — **入力は artifacts 安定パス**
- タイプ: manifest と CSV を突合 → 各人物行に画像ファイル名/URL を反映
  （`normalize-manifest.mjs` + `fetch-manual.mjs` の役割を worker 内で実行）→ CSV 再発行
- 画像の参照元は「同じプロジェクトの `artifacts/images/`」をデフォルトに。実行時に
  **manifest を展開してファイル単位で解決・`input_refs` に固定記録**する
  （ディレクトリ参照は記録が残らないため使わない — レビュー M5）

**J4 `csv-import`**
- payload: `{input_refs: [{kind:"csv", path:"artifacts/csv/織田家.csv"}], import_mode: new|merge, chart_id?}`
- タイプ: CSV をダウンロード → `parseCsvToGraph` 相当で persons/relationships 変換
  → chart JSON（`chartProps`）生成 → `artifacts/chart/` へ発行（+ 直接 chart 保存は P4）

**J5 `re-import`**
- payload: `{input_refs, chart_id, mode: merge|replace}`
- タイプ: 既存 chart の `chart_props` を取得 → マージ/置換 → 保存（`social_charts` 利用は host-merge-plan の進捗次第）

**J6 `image-generate`（AI生成 — これまでの手動AI生成の機械化）**
- payload: `{input_refs（対象CSV）or names[], series, model 優先度}`
  - `names[]` は「実画像が無い人物」**または「確認でNGになった人物」**（部分再実行に対応）
- タイプ: `gen-ai-images.mjs` のロジック
  - **Qwen qwen-image-2.0 優先**（DashScope INTL `multimodal-generation/generation` 同期）/
    **GLM cogview-3-flash フォールバック**（429時に自動切替）
  - 地域別スタイル（China=工筆画 / Japan=大和絵・浮世絵 / West=西洋油絵）+ 肩書から服装自動選択
  - **透かし除去**（下端80pxトリミング）+ **生成後 PIL 破損検証**（開けなければ失敗扱い）
- チェックポイント: 1名ごとに `progress` 保存（中断→N+1番目から再開）
- manifest に `source: "ai"` で記録（実画像と区別 — docs/samples の形式を流用）
- 発行: `artifacts/images/` を**上書き**（差し替え目的。旧版は jobs/ に残る）

**J7 `image-review`（人間確認ゲート — 最重要の差し替え入口）**
- payload: `{input_refs（対象 images）, review_scope: 全画像 or ng_names のみ}`
- 動作:
  1. コンタクトシート（`review-images.mjs` 相当）を UI に表示 — 各画像 + 出典タイトル・ライセンス
  2. 人が「OK / NG」を判定（**NG判定パターンは WORKFLOW.md をUIにガイド表示**:
     現代人・別人の肖像・無関係な物体・書画遺物 等）
  3. 判定結果を `result` に保存: `{approved, ng_names[], action: "ai-regen"|"refetch"}`
- ジョブは **`waiting_review`** で停止（claim 対象外・lease 切れ戻しの対象外。worker は先に進まない）。
  判定は UI が実施 → approve で `stepComplete`（= 完了 → publish）、reject で差し替えジョブ発行
  （状態機械は §2-2、P1 で確定 — レビュー H2）
- NG があった場合の差し替え: 同じプロジェクトへ**差し替えジョブを発行**（J6 `ng_names` 指定 or
  J2 部分再実行）→ 再確認ジョブ（J7）→ OK で完了
- 画像枚数が多い時は**バッチ判定**（ページ送りで数千枚も確認可能）

**J8 `interview-upload`（取材素材アップロード — 生きている人物向け）**
- payload: `{project_id, person_names[], material_types: audio|video|text|photo}`
- 素材は**ブラウザから**アップロード（browser session 必須 → gallery presign/finalize 経由）
  → `chart-jobs/{projectId}/jobs/{jobId}/materials/{person}/{name}` に登録し、アセット行をリンク
- **利用方法**:
  - 写真 → 人物画像として採用（ネット検索の代替。J7 で確認）
  - 音声/動画/テキスト → 情報抽出の入力（`interview-extract`、§9-14 のオプションタイプ）
- 再アップロード（取材後に追加素材）は**新しいジョブ（差分処理）を発行**して
  `artifacts/interview/{person}/` を更新（完了済みジョブへの追記は単一タイプモデルと
  衝突するため行わない — レビュー M9）

**J9 `interview-prep`（取材質問・チェックポイント生成）**
- payload: `{input_refs（人物の経歴・紹介 CSV）or 対象テキスト, 対象名, 言語}`
- タイプ: 経歴・紹介を入力に **LLM で取材用の質問リスト + チェックポイントを生成**
- 出力: `artifacts/interview/interview-questions.{json|csv}`
  - **質問**: 「生年月日・出身地は?」「配偶者・子は?」「代表作/業績は?」など人物の穴を埋める設問
  - **チェックポイント**: 確認すべき項目リスト（家系図の欠落フィールド = CSV 列の未入力分から導出）
  - 既存データと矛盾する点があれば「要確認」として列挙
- 生成した質問は画面に表示 → 取材者はそのまま取材に使う（チェックリストとして閲覧/印刷可）
- 取材結果は J8 の素材追加 or 直接 CSV 修正（`csv-create` の部分再実行）で反映

### 4-4. 成果物の発行（全タイプ共通の publish）

- **保存先 key**:
  - 作業: `chart-jobs/{projectId}/jobs/{jobId}/{file}`（タイプごとの内部構造: `images/`・`materials/`…）
  - 公開: `chart-jobs/{projectId}/artifacts/{kind}/{file}`（kind = csv / images / chart / interview）
- **manifest.json を必ず同梱**（出典・ライセンス・source:ai 記録 — docs/samples の形式を流用）
- 発行時: 成果物一覧を `steps[].artifacts` に記録（ジョブ詳細・ギャラリーが参照）
- 命名規則（playbook §11）: `{cleanBase}-{projectId8}.{ext}` 相当 — ギャラリー key 衝突防止
- S3 アップロードは `@aws-sdk/client-s3` `PutObjectCommand`/`CopyObjectCommand`（AWS CLI 禁止）
- **再実行時の上書き**: jobs/ はそのまま再書き込み（旧版は上書きで消える — 実行履歴は
  `steps[].history[]` に残す）。**artifacts/ は最新版のみ**（旧版は jobs/{旧jobId}/ に残る = 復元可能）

### 4-5. Docker / デプロイ（playbook §7–8）

- `apps/host/.docker/prd.runner.Dockerfile` に worker 追加（deps stage で `npm install --omit=dev --no-workspaces`）
- `docker-compose.yaml` に service `chart-worker`（同一 image、`command:` 上書き）
- `deploy-on-ec2.sh` の `COMPOSE_SERVICES`（worker/all）に追加
- 作業ディレクトリ: `/var/lib/ghost-next/chart-jobs/`（EBS、UID/GID 1001、書き込みプローブ）
- 環境変数: `GHOST_ADMIN_API_URL`（VPC internal）+ Admin JWT、`CHART_JOB_*`

---

## 5. ストレージ設計（S3 `think-ai-jobs` / `chart-jobs/` フォルダ）

```
s3://think-ai-jobs/
└── chart-jobs/                     # ファミリー prefix（media-jobs / deepzoom-jobs と同列）
    └── {projectId}/
        ├── jobs/
        │   └── {jobId}/            # 作業領域（各実行の生の成果物）
        │       ├── images/織田信長.jpg   # J2 の成果
        │       └── manifest.json         # 実行時 manifest
        └── artifacts/              # 公開成果物（参照・ギャラリー表示の対象）
            ├── csv/織田家.csv           # J1/J3 の成果
            ├── images/織田信長.jpg      # J2/J6 の成果（再発行で上書き = 最新版）
            ├── chart/織田家.json        # J4/J5 の成果
            ├── interview/…              # J8/J9 の成果（P2〜）
            └── manifest.json            # プロジェクト manifest（全アーティファクト集約）
```

- CloudFront: `{CHART_JOB_ASSET_HOST}/{projectId}/…`（CORS は XHR ビューアが無いため緩和でOK
  — ただし chart 内 `<img>` 読み込みがクロスオリジンになる場合は **S3 CORS + CF Origin キャッシュキー**の2層を確認、playbook §9）
- 削除:
  - ジョブ削除 → `chart-jobs/{projectId}/jobs/{jobId}/` 配下を `ListObjectsV2` + `DeleteObjects`
    （artifacts は残す — 他のジョブの参照対象のため。asset 行も jobs/ のみ対象 — §6-5・レビュー H3）
  - プロジェクト削除 → **カスケード削除**（子ジョブ行 + asset 行 + junction + S3 サブツリー全体。
    実行中ジョブがある場合は削除拒否 + 確認ダイアログ。§9-5 で確定 — レビュー M7）
- `project_id` null（既存 MVP）ジョブ: 旧配置 `chart-jobs/{jobId}/` のまま互換動作。
  既存データの移行は任意（§9-3 — レビュー M3）

---

## 6. ギャラリー連携（social_media_assets）

1. **scope 追加**（MVP 実装済み）:
   - `resolveGalleryScope` に `target:'chart_jobs'`（または `chart_job_id` 指定）分岐
   - `resolveUploadContext` に `gallery/chart_jobs/{projectId}/…` 分岐
2. **リンク列**: `social_media_assets.chart_job_id`（plain indexed、FK 無し、実装済み）
3. **リンク**: `link-assets` で **artifacts（安定）URL** を登録（`POST /social/ai/chart/jobs/:id/link-assets`）。
   junction `social_ai_chart_job_media` に role/source_kind/step_id/person_name を記録
4. **プロジェクトフィルタ**: ギャラリーのプロジェクト絞り込みは
   `social_ai_chart_job_media.chart_job_id → social_ai_chart_jobs.project_id` の join で実現
   （assets に列を追加しない — 汎用性維持）
5. **削除**: ジョブ destroy → **`storage_key LIKE '%/jobs/{jobId}/%'` のみ**を明示削除
   （作業領域の行だけ。artifacts の asset 行は `chart_job_id={id}` で消さない — 他ジョブの
   参照対象のため。プロジェクト削除時まで保持 — レビュー H3）
6. アセット生成は**ギャラリー presign/finalize ではなく worker の S3 直書き + link-assets**
   （worker は browser session を持たないため）— 実装済み

---

## 7. 画面 UI（01-ghost-front）

### 7-1. プロジェクト画面（P1 の中心）

- `app/social-ai/projects/`（一覧: 名前・タグ・状態・ジョブ数・最終更新 + 新規作成フォーム）
- `app/social-ai/projects/[id]/`（詳細）:
  - **ジョブ発行ボタン** → タイプ選択（タイプレジストリから）→ **タイプ別フォーム**
    （payload 入力。入力参照はプロジェクト内 artifacts から選択）
  - **ジョブタイムライン**（各ジョブの状態・進捗・成果物・エラーを時系列表示）
  - **artifacts 一覧**（テーブル形式: 種類/名前/サイズ/更新日時/出典/ライセンス。
    画像はギャラリー表示に連携。インポート導線あり）
  - **参照の可視化**: 「このジョブは `artifacts/csv/織田家.csv` を入力にした」をジョブ詳細に表示
  - キャンセル/削除（プロジェクト削除は確認ダイアログ）

### 7-1-1. ジョブ一覧/詳細（既存をプロジェクト対応）

- `app/social-ai/chart-jobs/`（一覧）: **プロジェクト列の表示・フィルタ追加**
- `app/social-ai/chart-jobs/[id]/`（詳細）: 既存画面を流用 + プロジェクトへの導線 + 参照元/参照先の表示
- 「このジョブを再実行」（ボタン → 部分対象指定はモーダルで入力）
- ジョブ作成は**プロジェクト詳細からの発行が基本**（既存の単発フォームはプロジェクト選択を追加）

### 7-1-2. 画像確認画面（J7 image-review 用）※差し替えの入口（P2）

- ジョブが「確認待ち」の時、この画面が開く:
  - **コンタクトシート表示**（`review-images.mjs` 相当）: 画像 + 人物名 + 出典タイトル + ライセンス
    （`source: "ai"` は AI 生成バッジ表示）
  - ページ送り対応（数千枚でも確認可能）
- **判定操作**（バッチ可）:
  - 「OK」→ そのまま通過 / 「NG」→ 理由付きでマーク（現代人・別人・無関係・書画遺物…）
  - 確定 → `submit review` → NG の人物は**「AI再生成」 or 「再取得」** を選んで差し替えジョブを発行
- 差し替え完了 → 再度この画面で**再確認**（OK になるまでループ、上限あり）
- 確認途中で中断しても、**判定結果は `result` に保存済み**なので後日続きから

### 7-1-3. 取材画面（J8/J9 用 — 生きている人物）（P3）

- **インタビュー準備（J9）**: 人物の経歴・紹介から生成された**質問リスト + チェックポイント**を表示
  - チェックリストとして印刷/エクスポート可（取材現場で使う）
  - 「質問を再生成」「別言語で」「質問追加」などの調整操作
- **素材アップロード（J8）**: 取材で得た素材を人物ごとに登録
  - 音声/動画/テキスト/写真をドラッグ&ドロップ → ジョブの materials フォルダへ
  - アップロード後は「写真を人物画像に採用」ボタン（→ J7 確認へ）
- 取材を何日にも分けても、素材・質問・確認結果はプロジェクトに残り続ける

### 7-2. ギャラリー画面（表示・選択・インポート）

- 既存 `components/gallery/`（GalleryAssetGrid）を `owner_scope=chart_jobs` + **プロジェクト**でフィルタ表示
- **選択 → インポート導線**:
  1. 成果物カード（CSV / 画像セット / chart JSON）を選択
  2. 「インポート」→ プレビュー（人数・関係数・画像枚数）
  3. インポート先を選択: **新規 chart** / **既存 chart へマージ（再インポート）**
  4. 実行 → chart エディタへ遷移（host 統合済み時）or ファイル取得→ローカル import（スタンドアロン時）

### 7-3. chart-job-agent（チャット統合）（P4）

- `agentRegistry.ts` に `"chart-job-agent"` 追加（ai-person-agent-plan §5 の family-chart-agent と連携）
- tools: `create_project(name, tags)` / `create_chart_job(project_id, type, payload)` /
  `list_projects()` / `list_chart_jobs(project_id)` / `get_chart_job(job_id)` /
  `rerun_chart_job(job_id, partial_payload?)` / `submit_chart_job_review(job_id, verdicts)` /
  `generate_interview_questions(project_id, person_names)` / `upload_interview_material(project_id, person, file)` /
  `import_chart_from_project(project_id)`
- スキルプロンプト（ja/zh/en）: WORKFLOW.md の手順を「プロジェクト + ジョブ」に翻訳した指示文に集約
- **継続指示の受け方**: 「続きから」「画像だけ再取得」「○○名を差し替え」「AIで作り直して」
  「生きている人だから取材素材で」などの指示を `rerun` / 部分 payload / 確認判定 / 取材ツールに
  翻訳（中断・再開・再実行・差し替え・取材を自然に操作できる）
- 人間確認ポイント: ジョブ発行前の payload 確認、再実行時の入力参照の確認、インポート前のプレビュー確認

---

## 8. フェーズ計画（MVP → 段階拡張）

> 各フェーズは**単独で動き・検証できる**単位。フェーズの途中で止めても成果が残り、
> 日を分けて次フェーズを続行できる（プロジェクト自体のレジューム思想と同じ）。

### MVP — 最小構成（**実装済み**）

**ゴール**: 「名前リスト指定 → 画像取得ジョブ → S3 `think-ai-jobs` / `chart-jobs/` → ギャラリーで表示・選択・インポート」を一巡できる。

| 項目 | 内容 |
|---|---|
| ジョブタイプ | **J2 `image-fetch` のみ**（1ジョブ=1ステップ） |
| バックエンド | `social_ai_chart_jobs` テーブル + browse/read/add/claim/progress/complete/fail/cancel/delete + link-assets |
| worker | runner.js + J2。チェックポイント（1名ごと・N+1番目から再開）実装済み |
| ストレージ | S3 `think-ai-jobs`（既存）+ `chart-jobs/{jobId}/images/` + manifest.json |
| UI | ジョブ作成・一覧/詳細 + ギャラリー表示（scope `chart_jobs`）+ 選択→インポート |
| 検証 | E2E: ジョブ作成→claim→画像取得→link-assets（assets+junction登録）→complete→CF配信 HTTP 200 |
| 見送り（後続） | プロジェクト・複数タイプ・AI生成・確認ゲート・取材フロー |

### P1 — プロジェクト化（**実装完了 2026-08-07** — E2E 検証ゲートは §8 末尾の手順で実施）

- **プロジェクト基盤**: `social_ai_projects` テーブル + `project_id` 列 + projects エンドポイント
- **2層成果物**: `jobs/{jobId}/` + `artifacts/{kind}/` への発行（publish）+ プロジェクト manifest
- **タイプレジストリ**: タイプ定義（payload スキーマ + UI フォーム）+ ジョブ発行フォーム自動生成
- **プロジェクトUI**: 一覧/詳細（ジョブ発行・タイムライン・artifacts 一覧・参照の可視化）
- ジョブタイプ追加: **J1 csv-create（簡易版）**・**J3 image-attach**・**J4 csv-import**
- フェーズの途中で止めても「プロジェクト」が残り、後日続きから（新しいジョブを発行するだけ）
- **検証ゲート（E2E）**: ①プロジェクト作成 → ②csv-create 発行 → publish で `artifacts/csv/` 確認
  → ③image-attach 発行（入力=artifacts 安定パス）→ ④csv-create 再実行 → **参照パスが不変のまま
  最新版を参照できること**を確認 → ⑤ギャラリーに artifacts のみ表示（jobs/ は非表示）— レビュー L6

### P2 — AI生成 + 人間確認ゲート

- **J6 image-generate**（Qwen優先・GLMフォールバック・地域別スタイル・透かし除去・破損検証）
- **J7 image-review**（確認画面 + 差し替えジョブ発行・NG判定パターンのUIガイド）

### P3 — 取材フロー（生きている人物）

- **J8 interview-upload**（素材登録・写真を人物画像に採用）
- **J9 interview-prep**（質問・チェックポイント生成 — LLM 直接呼び出し）

### P4 — chart-job-agent（チャット統合）+ 残タスク

- `agentRegistry.ts` への登録 + tools（create/rerun/review/interview/import）
- 音声・動画素材の情報抽出（§9-14）・`social_charts` 連動（host-merge-plan の進捗次第）

| 依存関係 | 内容 |
|---|---|
| MVP → P1 | ジョブ基盤が実装済みのため、projects + publish + タイプレジストリの追加のみで進む |
| P1 → P2 | 確認ゲートは「確認待ち」停止が必要 → ジョブ状態機械（既存）が前提 |
| P2 → P3 | 取材写真の確認は J7 を再利用 |
| P3 → P4 | 取材フローの tool 化が前提 |

---

## 9. 未確定事項（要決定）

> **P1 着手までに決めるのは 1〜5 のみ**。6 以降は各フェーズの着手時に決定してよい。

1. **バケット/フォルダ**: バケットは既存 `think-ai-jobs`、フォルダ（prefix）は `chart-jobs` で確定
   （media-jobs / deepzoom-jobs と同様の構成・2026-08-07決定）
2. **アセットリンク方式**: worker の S3 直書き → 発行時 `link-assets`（artifacts URL）で確定（実装済み方式の延長）
3. **インポート先**: `social_charts`（host-merge-plan.md）実装の進捗に依存。
   P3 時点で未統合なら「ダウンロード → ローカル import」で代替
4. **csv-create の LLM 利用**: 調査に LLM を使うか、指定ソース（Wikipedia API 等）の
   機械取得のみか。機械取得のみなら P1 で完結、LLM 併用ならモデル・キー管理を決定
5. ~~プロジェクト削除の挙動~~ → **決定: カスケード削除**（子ジョブ行 + asset 行 + junction +
   S3 サブツリー全体。実行中ジョブがある場合は 409 拒否 + 確認ダイアログ）。
   **参照中の artifacts はプロジェクト単位でしか消えない**ため他プロジェクトからの参照は
   構造的に発生しない（2026-08-07 レビュー M7 で確定）
6. ~~Wikimedia 429 の並行制約~~ → **決定: 固定 1 で確定**（worker concurrency=1）。
   タイプ別キューは将来の複数タイプ並行ニーズが出てから検討（レビュー L2）
7. **re-import の意味**: 既存 chart への**マージ**（import-schema.md の挙動）か**置換**か
   — 両モード対応で確定推奨
8. **docs/samples ツールの扱い**: worker の steps へ**移植**（重複）か、12-family-history-chart
   側を共通モジュールとして**参照**か。バージョン管理を考えると共通化推奨
9. ~~再実行時の成果物管理~~ → **決定: 2層方式**（jobs/ に実行ごとの成果物保持 + artifacts/ は最新版のみ上書き。
   旧版復元は jobs/{旧jobId}/ から。2026-08-07改訂で確定）
10. **中断→再開の粒度**: ジョブ単位（claim=1ジョブ）で確定。タイプ内 checkpoint の頻度
    （image-fetch は1名ごと＝確定。csv-create は CSV 書き出し時点のみで十分か）
11. **rerun の粒度**: ジョブ単位の再実行で確定（部分 payload で対象絞り）。**下流の自動無効化はしない**
    （= 自由度。整合性は artifacts 安定パスで担保）。「参照元が更新されたジョブ」の
    見える化は **`input_refs[].ref_updated_at` と manifest の更新日時比較**で実現
    （「このジョブは 07-31 版の CSV を参照しています」表示。P1 UI に入れる — レビュー M4）
12. **差し替えループの止め方**: J7→J6 を無限に繰り返さないため、**同一人物の再生成上限**
    （例: 2回で打ち切り → 「要手動対応」フラグ）を設けるか（P2 で決定）
13. **確認ゲートの粒度**: ジョブ単位で確認する（J2 完了後・J6 完了後の2段ゲートを標準パターンに推奨）。
    **状態機械の拡張（`waiting_review`）は P1 で確定済み**（claim 対象外・lease 切れ戻し対象外。
    判定は UI が stepComplete を呼ぶ — レビュー H2）
14. **音声/動画素材の情報抽出**（`interview-extract`）: 取材録音・録画から文字起こし→
    人物情報・家系情報を抽出するか。既存の AI media 基盤（文字起こし）を再利用するか、
    phase 後半に回すか
15. **生きている人物の画像方針**: 素材写真の**本人確認が必要**（現代人の肖像はネット検索で
    別人混入リスクが高い）。素材写真が無い場合は**画像なし**で通すか、明示的に確認を取るか。
    AI 生成の肖像（架空の顔）は生きている人物には**使わない**方針
16. **J9 の LLM 選択**: 質問・チェックポイント生成に使うモデル（既存 `aiChatModels.ts` の
    DeepSeek 等を worker から直接呼ぶ）。J1 csv-create の LLM 利用（§9-4）と同じモデル基盤にする
17. **artifacts の種類（kind）管理**: kind の一覧をタイプレジストリ定義に持たせる（タイプ追加で
    kind も増える）。kind 名の衝突・リネーム時の扱いは P1 実装時に確定
18. **タグ検索**: `tags`（longtext JSON）の検索は LIKE 全走査になるため現行規模で許容。
    タグ検索要件が発生した時点で正規化テーブル化を検討（レビュー L3）

---

## 10. 関連ドキュメント

- job-runner の実装詳細: 01-ghost-front `docs/architecture/job-runner-feature-playbook.md` + `.claude/skills/job-runner-feature/SKILL.md`
- ギャラリーの実装詳細: 01-ghost-front `.claude/skills/social-media-gallery/SKILL.md`
- 設計追補（junction/link-assets/共有ランタイム）: `docs/chart-job-agent-design-addendum.md`
- チャート取込仕様: `docs/csv-format.md`・`docs/import-schema.md`
- 作業手順（ジョブタイプの雛形）: `docs/samples/WORKFLOW.md`
- 関連計画: `docs/ai-person-agent-plan.md`・`docs/host-merge-plan.md`

---

*本書は全体計画のみ。着手時は Phase 単位で別途 実装計画を作成する。*
