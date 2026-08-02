# Chart (Page) JSON フォーマット仕様

家系図チャート1枚（ページ）の**完全な保存フォーマット**。座標・見た目・レイアウト設定まで含む「そのまま読み込める図」の形式です。
AI にレイアウト込みで図を生成させる用途（位置つき JSON を受け取って適用）にも使います。

> 「人物と関係だけ」を手早く追加したい場合は簡易版 [`import-schema.md`](./import-schema.md)（persons/relationships）や [`csv-format.md`](./csv-format.md) を使ってください。本書は**フル仕様**です。

- 文字コード：UTF-8 / JSON。座標系は SVG コンテンツ座標（px、y は下向き）。
- Import は `chartProps` を読みます（トップの `chartProps` ラッパー付き、または `persons`/`relationships` 単体も可）。保存/読込はページ全体（下記 PageProps）。

---

## トップレベル：PageProps

```jsonc
{
  "id": "page_xxx",            // 必須。ページ識別子
  "title": "徳川将軍家",        // 必須。タイトル
  "status": "draft",          // "draft" | "published"
  "category": "",             // 任意
  "thumbnail": "",            // サムネイル画像URL（保存時に自動生成されうる）
  "options": {},              // 任意の付帯情報
  "chartProps": { ... }        // 必須。図の中身（下記）
}
```

## chartProps

| フィールド | 型 | 説明 |
|---|---|---|
| `persons` | `PersonNode[]` | 人物・結婚(union)・メモ(note) ノード（下記）。**必須** |
| `relationships` | `Relationship[]` | ノード間の関係（下記）。**必須** |
| `dynasties` | `any[]` | 予約（未使用でOK、`[]`） |
| `episodes` | `Episode[]` | 人物のエピソード（任意、`[]`） |
| `events` | `any[]` | 予約（`[]`） |
| `viewport` | `ChartViewport` | 保存時のズーム/パン（復元用） |
| `viewSettings` | `ViewSettings` | レイアウトモード・間隔・Grid（復元用） |
| `background` | string | 背景色（CSS color） |
| `backgroundImage` | string | 背景画像 URL / data-URI |
| `backgroundOpacity` | number | 背景の不透明度 0..1（既定1） |
| `verticalText` | `"off"\|"cjk"\|"on"` | 図全体の縦書きモード（既定 off） |
| `dpi` | number | サムネ/印刷の DPI 上書き |

---

## PersonNode

ノードは `type` で3種類：`"person"`（既定）/ `"union"`（結婚の補助ノード）/ `"note"`（自由メモ）。

### 共通・識別
| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string | **必須**。関係の参照キー |
| `type` | `"person"\|"union"\|"note"` | 既定 person |
| `name` | string | **必須**（union は空可） |
| `title` | string | 肩書（将軍 等） |
| `gender` | `"male"\|"female"\|"other"` | 既定色に影響 |
| `birth` / `death` | string | 生年/没年。`"1543"`, `"1543-06-23"`, BC は `前200`/`公元前200`/`-200`、和暦 `明治3年`（timeline軸で解釈） |
| `age` | string | birth/death 無い時に表示 |
| `image` | string | 画像 URL / data-URI |
| `profileUrl` | string | 名前クリックで開く URL |
| `description` | string | 説明文（ノード付近に表示） |

### 位置（座標）
| フィールド | 型 | 説明 |
|---|---|---|
| `x` / `y` | number | コンテンツ座標。位置を固定したいときは併せて fx/fy を指定 |
| `fx` / `fy` | number \| null | force で固定する座標。**保存された図は x/y と同値の fx/fy を持つ**（再描画で動かないように）。自動配置に任せる場合は null/未指定 |

### 見た目（ノード形状）
| フィールド | 型 | 説明 |
|---|---|---|
| `shape` | `NodeShape` | 下記。既定 `circle` |
| `nodeSize` | number | 円/菱形/六角の半径、矩形の半高（既定40） |
| `bgColor` / `borderColor` | string | ノード塗り/枠 |
| `bandWidth`/`bandHeight`/`bandStart`/`bandEnd` | number/string | `band`（王朝帯）専用 |

`NodeShape` = `circle` `rect` `diamond` `hexagon` `band` `ellipse` `star` `shield` `bubble` `tag` `seal` / 装飾: `kabuto` `thinker` `manga` `flyer` `scroll` `castle` `crest` `enso` `compass` `book` / 人物フレーム: `pGeneral` `pNoble` `pRoyal` `pScholar` `pMonk` `pHero`

### ラベル（名前）表示
| フィールド | 型 | 説明 |
|---|---|---|
| `labelColor` / `labelFontSize` / `labelBold` / `fontFamily` | | 名前の既定スタイル |
| `nameStyle` / `titleStyle` / `descriptionStyle` | `TextStyle` | フィールド毎の個別上書き（未設定は上の既定にフォールバック） |
| `labelPosition` | `above\|below\|left\|right\|inside` | 名前の位置 |
| `labelOffsetX/Y` | number | 名前ラベルの自由ドラッグ位置（設定時 labelPosition より優先） |
| `labelBgColor` / `labelBgShape` | string / `rect\|pill` | 名前の背景 |
| `labelRotation`/`labelScaleX`/`labelScaleY`/`labelSkewX` | number | 名前ボックスの変形（scale 負で反転、skew 度） |
| `periodOffsetX/Y` | number | 生没年(period)ラベルの自由位置（title とは独立） |
| `vertical` | `on\|off` | ノード単位の縦書き上書き |

`TextStyle` = `{ color?, fontSize?, fontFamily?, bold? }`

### 説明（description）表示
| フィールド | 型 | 説明 |
|---|---|---|
| `descriptionPosition` | `below\|right` | 位置 |
| `descriptionWidth` / `descriptionHeight` | number | 箱の幅/高さ |
| `descriptionOffsetX/Y` | number | 自由ドラッグ位置 |
| `descriptionBgColor`/`descriptionBgShape`/`descriptionBgOpacity` | | 背景（opacity 0..1、既定0.9） |
| `descriptionBorder` | boolean | 枠表示 |
| `descriptionAlign` | `left\|center\|right` | 揃え（既定 center） |
| `descriptionRotation`/`descriptionScaleX`/`descriptionScaleY`/`descriptionSkewX` | number | 説明箱の変形 |

### メモノード（type:"note"）
| フィールド | 型 | 説明 |
|---|---|---|
| `noteShape` | `plain\|sticky\|bubble\|card\|banner\|oval\|cloud\|burst` | メモの枠形状（各風） |

メモは `description` を本文に使い、`descriptionWidth`/位置/背景等の description 系フィールドで見た目を制御します。

### 結婚ノード（type:"union"）
結婚は補助ノード `union` で表します。両配偶者から `partner` エッジ、子は union から `parent-child` エッジ。
| フィールド | 型 | 説明 |
|---|---|---|
| `marriage` | `{ start?, end?, label?, type? }` | union が表す実際の関係（`type` は `marriage`/`remarriage` 等） |

---

## Relationship

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | ✅ | 関係ID |
| `source` | string | ✅ | 起点ノードの `id` |
| `target` | string | ✅ | 終点ノードの `id` |
| `type` | `RelationType` | ✅ | 下記 |
| `label` | string | — | エッジ上の表示 |
| `start` / `end` | string | — | 期間（結婚等） |
| `color` / `width` | string / number | — | 線色 / 太さ |

`RelationType` = `parent-child` `marriage` `remarriage` `partner` `sibling` `succession` `ally` `rival` `mentor` `enemy` `friend` `custom` `master` `disciple` `comrade`

### 関係の表し方（重要）
- **血縁（親→子）**：`parent-child`（source=親 or union、target=子）。
- **結婚**：`union` ノードを1つ作り、両者から `partner`（person→union）。子はその union から `parent-child`（union→child）。
  - どの結婚の子かは、子を **その夫婦の union** にぶら下げることで表す。
  - 単親（片方のみ判明）は person→child の直接 `parent-child` でも可。
- **兄弟**：`sibling`（任意）。通常は共通の親（同じ union / 同じ親）で暗黙に表現。
- **その他**：`succession`(継承)、`master`/`disciple`(師弟)、`comrade`(戦友)、`ally`/`rival`/`enemy`/`friend` など。

---

## ViewSettings / ChartViewport

```jsonc
"viewSettings": {
  "layoutMode": "auto",       // "auto" | "tidy"(系図) | "timeline"(年表) | "force"(関係図)
  "lastLayoutKind": "tidy",   // 実際に適用された種別（timeline軸の表示に使用）
  "spacing": 1,               // 間隔スライダー（座標スケール係数）
  "showGrid": true,
  "gridSize": 20,
  "edgeStyle": "straight"     // 親子の配線: "straight"(直線) | "ortho"(直交バス)。系図(tidy)のみ有効
}
"viewport": { "k": 1, "x": 0, "y": 0 }   // ズーム k・パン x,y
```

> `viewSettings` はページ保存時に記録され、**再Open時にそのまま復元**されます（レイアウトモード・間隔・Grid・配線・
> ズーム/パン）。図の見た目を保存どおりに再現したい場合は、この `viewSettings` と各ノードの `fx/fy`（固定座標）を
> 併せて保持してください。ホストDB連携では読込マッパーが `viewSettings` を落とさないこと（[`host-merge-plan.md`](./host-merge-plan.md) の注意点参照）。

### 配線スタイル（`edgeStyle`）
親子エッジの描画方法。**系図(tidy)モードのときだけ有効**（関係図/年表では常に直線/曲線）。
- `"straight"`（既定）：親→子を直線（同一ペア複数辺は曲線でオフセット）。
- `"ortho"`（直交バス／ブラケット）：親→縦線→**兄弟共有の水平バー**→各子へ縦線。同じ親の子は同じバーを共有して整列。
  子が1人だけ、または子が親より上にある場合は自動で直線にフォールバック。
  1関係=1エッジのまま（各子の縦線がその親子関係）なので、**エッジクリック→関係ダイアログは従来どおり**。

---

## AI でレイアウト生成する場合（タスク④）
- 最小構成：`chartProps.persons[]`（`id,name,gender,title,description,birth,death` ＋ `x,y,fx,fy`）と `chartProps.relationships[]`。
- 結婚は **union ノード＋partner/parent-child** で表現（上記）。
- 位置を固定したいノードは `x==fx`, `y==fy` にする（保存済み図と同じ挙動）。
- 年表用途では `birth` を数値/BC/和暦で入れる（`前200`/`明治3年` も可）。
- ライブラリ内蔵の自動整列（関係図/系図/年表）に任せる場合は座標を省略し、`viewSettings.layoutMode` を指定してもよい。

---

## CSV → レイアウトJSON 変換の注意点（AI向け）

CSV（[`csv-format.md`](./csv-format.md)、1行=1人）を受け取り、位置つきの chart JSON を作るときの要点。
対応サンプル：[`samples/chart-sample.csv`](./samples/chart-sample.csv) → [`samples/chart-sample.json`](./samples/chart-sample.json)（同じ家族）。

1. **結婚は union ノードに展開**：CSV の `配偶者`、および子の `父＋母` の組から **union ノードを新規生成**（id 例 `u1`,`u2`…）。両親→union は `partner`、子→は `union→child` の `parent-child`。
   - 結婚を person↔person の直接エッジにしない（子がぶら下げられない）。
   - **子の所属 union は「その子の父＋母」で決める**（多妻の場合の取り違え防止）。片親のみなら person→child の直接 `parent-child`。
2. **ID**：各人物に一意な `id`。名前が一意ならそれを id にしてよい（重複時は `名前_suffix`）。relationships の `source`/`target` は必ず実在の id を指すこと。
3. **フィールド対応**：`性別→gender`(男/女→male/female)、`肩書→title`、`メモ→description`、`生年/没年→birth/death`。CSV に無い情報を創作しない。
4. **座標**：レイアウトを AI 側で決めるなら各ノードに `x,y` を与え、**固定するため `fx=x, fy=y`** も設定。原則：
   - 縦＝世代（**親は子より上**）、同世代は同じ y 帯。
   - 夫婦は隣接、その **union はふたりの間**、子は **union の真下に中央寄せ**。
   - **重ならない**よう十分な間隔（人物中心間の最小距離を確保）。
   - 兄弟は同じ親/union の下に横並び。
5. **BC/和暦**：`birth` は `前200`/`公元前200`/`-200`/`明治3年` 等の表記のまま入れてよい（年表軸が解釈）。
6. **自動整列に任せる場合**：`x/y/fx/fy` を省略し、`viewSettings.layoutMode`（`tidy`/`timeline`/`force`/`auto`）を指定。アプリ内蔵レイアウトが配置する（無料・即時・重なりなし）。**大規模や自信がない配置はこちらを推奨**。
7. **出力**：整形済み JSON のみ。最小は `chartProps.persons[]` ＋ `chartProps.relationships[]`（＋任意で `viewSettings`）。`note`（メモ）や `succession`（継承）などは CSV に無い追加要素。

> AI用の完成プロンプト（ja/zh/en、agent の skillPrompt に流用可）：[`ai-layout-skill-prompt.md`](./ai-layout-skill-prompt.md)

---

サンプル：[`samples/chart-sample.json`](./samples/chart-sample.json) / [`samples/chart-sample.csv`](./samples/chart-sample.csv)
