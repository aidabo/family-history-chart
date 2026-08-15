# AI Person Agent × Family Chart — 全体計画 (plan only)

AI（chat panel の person 系 agent）で「人物・時代・小説・漫画・キャラ・名人」の**関係を検索→登録→家系図/年表を自動生成**し、さらに各人物の**エピソード/ストーリー**を充実させる。ここでは**全体計画のみ**を示す（実装は別タスク）。

> 方針：既存の host AI/person 基盤を**再利用**し、家系図(このリポジトリのlib)を出力先として接続する。person/person-graph 本体のコードは所有が別なので、本計画は**参照のみ**（改変は各所有者と調整）。

---

## 0. スコープ / ゴール

- **入力**：ユーザーが chat で対象を指定（例「織田信長の一族」「紅楼夢の賈家」「ドラゴンボールの孫家」「明治の総理大臣」）。
- **出力**：
  1. 人物＋関係の **CSV / JSON**（家系図に取り込める形）
  2. 取り込み済みの **chart（social_chart）**
  3. （phase2）各人物の **画像・参照・抜粋・エピソード/イベント**
- **非目標（当面）**：完全自動の史実検証、レイアウトの完全自動最適化（人手調整前提）。

---

## 1. 既存資産（再利用対象）

### AI Agent フレームワーク（host: `01-ghost-front/apps/host/src`）
| 資産 | パス | 役割 |
|---|---|---|
| Agent レジストリ | `lib/ai/agentRegistry.ts` | `orchestrator` が意図を専用agentへ振分け。`person-story-agent`・`search-agent`・`estate-registration-agent` 等が既存。`toolNames`/`settingsFields`/`skillPromptsByLocale(ja/zh/en)` |
| チャット routing | `lib/ai/chatModelRouting.ts`・`chatCommandRouting.ts`・`chatImagePolicy.ts` | モデル選択・コマンド・画像方針 |
| モデル設定 | `config/aiChatModels.ts` | 使用可能モデル（DeepSeek 等） |
| Chat panel UI | `components/ai/panel/` (`AssistantComposer`,`ChatModePill`,`ToolSidebar*`) | 入力・モード・agent設定サイドバー |
| Agent 設定/結果 UI | `components/ai/agents/*` (`AgentQuickCard`,`AgentResultCard`,`*SettingsPanel`,`agentSurfaceRegistry.tsx`) | agentごとのカード/設定 |
| **登録agentパターン** | `components/ai/agents/PersonRegistrationAgentPanel.tsx`・`EstateRegistrationAgentPanel.tsx` + `estate/`・`ExtractedPropertyDraftForm.tsx` | **検索→抽出→ドラフト確認→登録** の実績パターン（本計画のタスク1の雛形） |

### Person / 関係 / ストーリー
| 資産 | パス | 役割 |
|---|---|---|
| Person Graph | `services/personGraph/personGraphApi.ts`・`services/ghost/personGraphCapabilities.ts`・`components/person/graph/PersonGraphBrowser.tsx`・`hooks/PersonGraphHostDataSource.service.ts` | 人物と**関係**のデータ源 |
| Person Story | `services/personStory/*` (`personStoryTypes.ts`,`Api`,`Mappers`,`Registration`,`Manifest`,`referenceExamples`)・`lib/personStory/*`・`components/person/story/*` | **lifeEvents / episodes / storySections**（タスク2・エピソードの土台） |
| Person Context/Card | `contexts/PersonContext.tsx`・`templates/common/PersonCard.tsx`・`components/person/gallery/*` | 人物選択・ギャラリー（画像） |

### Family Chart（本リポジトリ）
| 資産 | パス | 役割 |
|---|---|---|
| CSV 取込/書出 | `src/lib/utils/csv.ts` / 仕様 `docs/csv-format.md` | 1行1人・関係を名前参照で自動生成 |
| JSON 取込 | `docs/import-schema.md` | persons/relationships（`chartProps` 対応） |
| レイアウト | `src/lib/utils/familyLayout.ts` | 関係図(force)/系図(tidy)/年表(timeline)、クラスタ分離・年軸・BC/和暦 |
| 保存(社会図) | `docs/host-merge-plan.md`（social_charts テーブル/API 計画） | chart の永続化先 |

### データ型の対応（既存 PersonStory → chart）
- `PersonStorySnapshot.relatedPeople` → **関係図の元**（人物・関係）
- `lifeEvents[] {year,title,description}` → **年表(timeline)の event**／description
- `episodes {title,excerpt,published_at}` / `storySections` → **エピソード**（phase2）

---

## 2. パイプライン（概念）

```
[chat 指定] 
   └─(orchestrator)→ family-chart agent
        │
   ①検索・関係抽出 ── web_search + 既存 personGraph/personStory 参照
        │            → 人物＋関係の "ドラフト"（確認UI）→ CSV/JSON
        ▼
   ②(phase2) 画像・参照・抜粋・episode/event ── 別CSV/JSON（image URL, excerpt, description, events）
        │
        ▼
   ③CSV/JSON import ── src/lib/utils/csv.ts + import-schema → social_chart 作成
        │
        ▼
   ④レイアウト ── familyLayout(関係図/系図/年表) で自動配置
        └─(任意) AI に「chart JSON フォーマット」を提示→位置つき JSON を得て微調整
```

---

## 3. タスク詳細（本題の4点 ＋ エピソード）

### タスク1：関係の検索→CSV作成（最優先 / phase1）
- **担当agent**：新規 `family-chart-agent`（`agentRegistry.ts` に追加）。`orchestrator` から「家系/関係」意図で振分け。
- **tools**：`web_search`（既存）＋ 既存 `personGraph`/`personStory` 参照（重複回避・既知人物リンク）。
- **フロー**（`PersonRegistrationAgent` の踏襲）：検索 → 人物・関係の**ドラフト抽出** → ユーザー確認/編集UI → **CSV**（`docs/csv-format.md`）または **import JSON**（`docs/import-schema.md`）を確定。
- **出力契約**：CSV（名前・性別・生没・父母・配偶者・養/義・肩書・メモ）。多い場合は数百行可。BC/和暦は生年に `前200`/`明治3年` 可（`parseYear` 対応済み）。
- **品質**：AIに「**出典/確信度**」を添えさせ、確信の低い関係は破線/注記。人手確認を前提。

### タスク2：画像・参照・エピソード（phase2）
- 人物ごとに **別CSV/JSON**：`image`(URL)・`profileUrl`・`description`(excerpt)・`events`/`episodes`。
- **担当**：既存 `person-story-agent` を活用（`lifeEvents`/`episodes`/`storySections`）＋ `PersonGalleryManager`（画像）。
- chart 側は person の `image`/`description` に反映、`event/episode` は timeline の event ノード（将来）に接続。

### タスク3：CSV import → chart 作成（phase1）
- 確定した CSV/JSON を **family-chart の import** に渡し、`social_chart`（`host-merge-plan.md`）として保存。
- chat から「この関係で図を作成」→ 新規 chart を生成し編集画面へ遷移。

### タスク4：chart JSON をAIに提示→レイアウト改善（phase1後半）
- **契約フォーマット＝ページJSON**（`chartProps.persons[] {id,name,gender,title,description,x,y,fx,fy,...}` ＋ `relationships[]`）。DeepSeek で生成実績あり（`docs/samples/hongloumeng-jia-family.json`）。
- 既定は **ローカルの `familyLayout`** で自動配置（関係図/系図/年表、無料・即時・決定的）。
- 任意で **AI整列**：現状の persons/relationships をAIに渡し、位置つきJSONを受領→適用（AI失敗でも図は維持＝ハイブリッド）。

### エピソード/ストーリー（継続テーマ）
- 「各人物の物語」は既存 `person-story` 基盤（`personStoryTypes.ts` 等）に集約。現状 DeepSeek 生成が未達なので、**参照例(`personStoryReferenceExamples.ts`)＋出典必須＋章立て(storySections)テンプレ**で品質を上げる（phase2）。

---

## 4. データ契約（要点）

| 種別 | 形式 | 定義 |
|---|---|---|
| 関係（取込） | CSV | `docs/csv-format.md`（1行1人・名前参照） |
| 人物/関係（取込） | JSON | `docs/import-schema.md`（persons/relationships, chartProps可） |
| chart（保存/整列） | ページJSON | `chartProps{persons,relationships,events,episodes}`（`host-merge-plan.md`） |
| ストーリー | PersonStorySnapshot | `services/personStory/personStoryTypes.ts`（lifeEvents/episodes/sections） |

---

## 5. Agent 追加（設計方針のみ）
- `agentRegistry.ts` の `AiAgentId` に `"family-chart-agent"` を追加。
  - `label`：家系図/関係図
  - `toolNames`：`web_search`（＋将来 `import_chart`,`create_chart` 等の内製tool）
  - `settingsFields`：対象種別（史実/小説/漫画）、規模（人数上限）、出典厳格度、AI整列ON/OFF
  - `skillPromptsByLocale`：ja/zh/en（「関係を CSV フォーマットで、出典と確信度つきで」）
- UI：`components/ai/agents/` に `FamilyChartAgentPanel`（`PersonRegistrationAgentPanel` を雛形に）＋ `agentSurfaceRegistry` 登録。
- 出力レビュー：抽出ドラフトを表（人物/関係）で確認→編集→確定（`ExtractedPropertyDraftForm` の踏襲）。

---

## 6. フェーズ計画

| Phase | 内容 | 依存 |
|---|---|---|
| **P1** | family-chart-agent（検索→関係CSV/JSON ドラフト→確認）＋ import→chart作成＋ familyLayout 整列 | 既存 AI基盤・csv.ts・familyLayout |
| **P1.5** | タスク4 の「AI整列」（ページJSON往復、ハイブリッド） | P1 |
| **P2** | 画像/参照/抜粋＋episode/event（person-story 連携、gallery） | 既存 personStory・gallery |
| **P3** | 出典/確信度の可視化、史実検証補助、event ノードの timeline 表示 | P2 |

---

## 7. 未確定事項（要決定）
1. **agent 実体の置き場所**：host の既存 `person-story-agent` を拡張 か、`family-chart-agent` を新設か（ユーザーは「作り直すつもり」）。
2. **LLM**：DeepSeek 継続 か `config/aiChatModels.ts` の他モデル併用か。
3. **保存**：`social_charts`（`host-merge-plan.md`）実装の優先度（P1で必要）。
4. **person 所有境界**：personGraph/personStory を「参照のみ」で足りるか、書込み（登録）まで行うか。
5. **出典・著作権**：小説/漫画キャラの excerpt/画像の扱い（引用範囲・URL参照に限定 等）。

---

*本書は全体計画のみ。着手時は Phase 単位で別途 実装計画/PR を作成する。*
