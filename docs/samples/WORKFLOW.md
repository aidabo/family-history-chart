# サンプルデータ作成ワークフロー（CSV作成・画像取得・AI生成・関係図CSV）

この文書は、`docs/samples/` 配下の**データ準備（CSV作成）→ 人物画像の取得・生成 →
関係図CSVの作成**を自動処理するための手順書です。将来の Agent はこの手順に従って作業してください。

対象データ:
- `docs/samples/{01-China,02-Japan,03-West}/*.csv` — 人物データ（名前・肩書・期間など）
- `docs/samples/images/{01-China,02-Japan,03-West}/` — 画像の**正規の保存場所**（画像 + manifest.json）。
  画像はこのフォルダに置いたままにする（CSV直下へのコピーは行わない・2026-08-07決定）

全体の流れ:

```
[0] CSV指示受け → データ取得 → CSV作成 ─→ [1] Wikimedia検索・DL ─→ [2] レビュー ─→ [3] AI生成
        gen-*.mjs + 検証                  fetch-images.mjs        cleanup       gen-ai-images.mjs
```

---

## 0. データ準備（CSV指示受け → データ取得 → CSV作成）※画像取得の前段階

### 0-1. 指示の受領と解釈

依頼内容から以下を確定する:
- **対象**: どのシリーズか（中国/日本/欧米）、どの区分か（朝代/人物/思想家/官僚）
- **含める情報**: 人物（名前・性別・生没年・肩書・期間・親族・関係）か、区分（朝代/時代/国家）か
- **粒度**: 主要人物のみか、全員か

### 0-2. データ取得（調査）

- **基本情報源**: Wikipedia（日本語/中国語/英語）の人物・朝代記事。年月は**伝承の推定**が
  多いため、メモに「生没年は概算」「在位年は推定」などと明記する
- **伝説・神話人物の扱い**:
  - 三皇五帝（燧人氏・伏羲・神農・黄帝・顓頊・帝嚳・堯・舜）は正統な構成を守る
    （三皇=3名、五帝=5名。女媧などは「三皇別伝」と別表記にする）
  - 生没年は「约前XXXX」形式で概算を明示
- **元号・期間**: 既存CSVの区分（ファイル名の `NN-朝代-開始-終了`）と整合させる
- **関係（エッジ）**: 血縁（父/母/配偶者）、君臣（主君）、継承（先王）、朝代更换（前王朝）、
  師弟（師）、エンティティ（著作/学派/事件/地/概念）を CSV 形式仕様に沿って収録

### 0-3. CSV作成（生成スクリプト）

**人物CSV生成スクリプト**（`docs/samples/` 配下）:

| スクリプト | 生成物 | 入力 |
|---|---|---|
| `gen-family.mjs` | 朝代別の家族CSV（`china-NN-朝代-期間-family.csv`） | `china-imperial-succession.csv`（帝王）＋家族関係データ |
| `gen-officials.mjs` | 朝代別の官僚・君臣CSV（`-officials.csv`） | 肩書・主君データ |
| `gen-thinkers.mjs` | 思想家CSV（`china-thinkers.csv` 等、単一ファイル） | 師・学派・著作データ |
| `gen-japan.mjs` | 日本シリーズCSV | `japan-data.mjs`（データ定義） |
| `gen-west.mjs` | 欧米シリーズCSV | `west-data.mjs`（データ定義） |
| `gen-japan-thinkers.mjs` / `gen-west-thinkers.mjs` | 日本・欧米の思想家CSV | — |

```bash
node docs/samples/gen-family.mjs      # → docs/samples/01-China/china-NN-*.csv
```

**CSV形式の仕様**は `docs/csv-format.md` を参照（列: 名前/性別/生年/没年/父/母/配偶者/
養父/養母/義父/義母/肩書/期間/主君/継承/朝代更换/メモ/ID。エンティティ列: 著作/学派/事件/地/概念）。

### 0-4. CSV検証（必須）

```bash
# 参照整合性（ファントム参照=存在しない名前への参照が0であること）
node -e "
const fs = require('fs');
for (const f of ['docs/samples/01-China/china-imperial-succession.csv']) {
  const lines = fs.readFileSync(f,'utf8').split('\n').filter(Boolean);
  const rows = lines.slice(1).map(l=>l.split(','));
  const names = new Set(rows.map(r=>r[0]));
  let phantom = [];
  for (const r of rows) for (const col of [5,6])   // 継承=5, 朝代更换=6
    for (const ref of (r[col]||'').split(/[；;]/).filter(Boolean))
      if (!names.has(ref.trim())) phantom.push(r[0]+'→'+ref);
  console.log(f, '重複:', rows.length - names.size, '/ ファントム:', phantom.length ? phantom.join(';') : 'なし ✓');
}
"
```

チェック項目:
- [ ] 重複名0（後漢のような同名は既存慣例に従い 東漢/後漢 と区別）
- [ ] ファントム参照0（全 継承/朝代更换/父/母/配偶者/主君 の参照先が行に存在）
- [ ] 期間形式 `前?数字-前?数字`（約数は「约前XXXX」を生没年にのみ使用）
- [ ] 同一人物の表記が他CSV（thinkers 等）と一致（グラフで結合できるように）

---

## 1. 画像取得・生成パイプライン

```
[1] Wikimedia 検索・ダウンロード ─→ [2] レビュー（出鱈目除外） ─→ [3] AI生成（不足分）
          fetch-images.mjs              review/cleanup                 gen-ai-images.mjs
```

### ステップ1: Wikimedia Commons から検索・ダウンロード

**主スクリプト** `docs/samples/fetch-images.mjs`（CSVの名前列で検索→ダウンロード）:

```bash
# 全シリーズ（03-West → 02-Japan → 01-China の順）
node docs/samples/fetch-images.mjs

# シリーズ指定 / 件数制限 / rejected再検索
node docs/samples/fetch-images.mjs 01-China        # Chinaのみ
node docs/samples/fetch-images.mjs 03-West 50      # 最初の50名のみ
node docs/samples/fetch-images.mjs 02-Japan rej    # rejected分を再検索（肖像語句付き）
```

**補助スクリプト**:
- `fetch-manual.mjs` — ファイル名を確定指定して取得:
  ```bash
  node docs/samples/fetch-manual.mjs 03-West '[[名前,"File:X.jpg"],...]'
  ```
- `fetch-article-images.mjs` — Wikipedia記事のリード画像（肖像として最も信頼できる）:
  ```bash
  node docs/samples/fetch-article-images.mjs 02-Japan ja.wikipedia.org '[[CSV名,記事名],...]'
  ```

**動作の要点**:
- 検索は `"${名前}"` 完全一致クォート（ジャンク防止）
- **429制限対策が組み込み**: 適応ペース（429で倍増・成功で減衰）+ ジッター + リトライ
- 日本の天皇は `File:Emperor X.jpg` パターンが存在（ローマ字・マクロンなし）
- 検索で見つからなければ Wikipedia 記事リード画像にフォールバック

### ステップ2: レビュー（出鱈目画像の除外）※最重要

検索ベースの取得は**神話・伝説人物に約60%の出鱈目**を含む（現代人・別人・地図・銅器・
風景・オブジェクト等）。必ずレビューしてから確定させる。

1. **コンタクトシート生成**（機械的ヒューリスティックで怪しい画像にフラグ）:
   ```bash
   node docs/samples/review-images.mjs 01-China        # → images/01-China/review.html
   node docs/samples/review-images.mjs 03-West /tmp/names.txt  # 指定名のみ
   ```
   `python3 -m http.server 8765` で `http://localhost:8765/01-China/review.html` を表示。
   画像の目視ができない環境では、**タイトルメタデータで判定**する（下記パターン参照）。

2. **出鱈目画像のreject**:
   ```bash
   node docs/samples/cleanup-images.mjs 01-China 夏相 商外丙 ...   # ファイル削除+status:rejected
   ```

3. **manifest正規化**（同名の重複エントリを1つに。優先: source:ai > done(実ファイル) > missing > rejected > error）:
   ```bash
   node docs/samples/normalize-manifest.mjs 01-China
   ```

**reject判定パターン（タイトルで機械判別）**:
- 現代人: 俳優・歌手・選手・政治家・声優・国会議員・市長 など（例: 陳曉東/James Hong/楊勇緯/Chin Peng）
- 別人の肖像: タイトルの人物名がCSV名と不一致（例: 明思宗←天啓帝、清太祖←ドルゴン）
- 無関係な物体・風景: 地図/星図/青銅器/墓誌銘/碑/コイン/花/魚/駅/公園/観光地/道路標識/教会
- 書画・遺物: 書法（蘭亭序）/耕織図/碑文/拓本/竹簡/墨/インク棒
- タイトルに「動画・歌・バンド・コンサート」などの現代コンテンツ

**重要な注意（manifest競合）**:
- `fetch-images.mjs` は**1名処理ごとにmanifest全体を上書き**する
- → **取得プロセスが動いている間に cleanup/reject してはいけない**（上書きで消える）
- 必ず `pgrep -f "fetch-images"` でプロセス停止を確認してから reject すること

### ステップ3: AI生成（実画像が存在しない人物）

**スクリプト** `docs/samples/gen-ai-images.mjs`（Qwen優先・GLMフォールバック）:

```bash
export GLM_API_KEY=$(grep '^GLM_API_KEY=' ~/work/legacy/01-ghost-front/apps/host/.env.development | cut -d= -f2- | tr -d '"')
export DASHSCOPE_API_KEY=$(grep '^DASHSCOPE_API_KEY=' ~/work/legacy/01-ghost-front/apps/host/.env.development | head -1 | cut -d= -f2- | tr -d '"')

# 使い方
node gen-ai-images.mjs 夏相 商外丙                    # 指定名を生成
node gen-ai-images.mjs --list=/tmp/names.txt          # リストファイル
node gen-ai-images.mjs --series=02-Japan --list=...   # シリーズ指定（地域別スタイル）
node gen-ai-images.mjs 名前 --force                   # AI生成済みでも再生成
```

**プロバイダ**:
- 優先: **Qwen qwen-image-2.0** — DashScope INTL `multimodal-generation/generation` 同期エンドポイント
  （`model: "qwen-image-2.0"`, `size: "1024*1024"`）
- フォールバック: **GLM CogView**（cogview-3-flash）— レート制限が発生しやすい（429時は自動フォールバック）

**仕様**:
- 地域別スタイル: China=工筆画風 / Japan=大和絵・浮世絵風 / West=西洋油絵風
  （肩書から服装を自動選択: 帝→竜袍、皇后→十二単、将軍→甲冑 等）
- **透かし除去**: 下端80pxをトリミング
- **破損検証**: 生成後にPILで開けるか確認（開けなければ失敗扱い）
- manifestに `"source": "ai"` で記録（実画像と区別）

**AI生成対象の決め方（主要人物のみ生成する場合）**:
- 肩書が 帝/皇帝/皇后/皇太后/国王/王妃/皇太子/摂政/宰相/丞相/大将軍/太傅 など主要なもの
- 思想家CSV（thinkers）の全員
- それ以外の遠縁・側室・無名の官僚は対象外でよい

### manifest.json の形式

```json
[
  {
    "name": "漢惠帝劉盈",        // CSVの名前（ファイル名と同じ）
    "status": "done",             // done / rejected / missing / error
    "file": "漢惠帝劉盈.png",
    "source": "ai",               // AI生成画像のみ付与（実画像は無し）
    "title": "File:...",          // Wikimedia出典タイトル（AI生成はスタイル名）
    "url": "https://...",         // 出典URL
    "license": "Public domain",   // ライセンス
    "artist": "...",              // 作者
    "width": 1024, "height": 944
  }
]
```

### 検証コマンド（完成時）

```bash
# 破損画像チェック（全done画像をPILで開く）
python3 - << 'EOF'
from PIL import Image
import os, json
for s in ['01-China','02-Japan','03-West']:
    d = 'docs/samples/images/'+s
    m = json.load(open(d+'/manifest.json'))
    bad = [e['file'] for e in m if e['status']=='done'
           and not os.path.exists(os.path.join(d,e['file']))]
    # ※PILで開く検証も同様に
    print(s, 'done:', sum(1 for e in m if e['status']=='done'), '欠落:', len(bad))
EOF

```
※ CSV直下（docs/samples/{01-China,02-Japan,03-West}/）へのコピーは行わない
  （画像の正規の場所は images/ 配下のみ・2026-08-07決定）
```

---

## 2. 関係図CSVの作成（朝代・時代・国家）

人物CSVとは別に、**朝代/時代/国家の関係図CSV**を作成できる。
形式は `docs/csv-format.md` の標準列（`名前,肩書,期間,継承,朝代更换,メモ`）に従う。

既存ファイル:
- `01-China/china-dynasties.csv` — 中国 50朝代・36エッジ
- `02-Japan/japan-eras.csv` — 日本 15時代・14エッジ
- `03-West/west-states.csv` — 欧米 12国家・8エッジ

### 作成手順

1. **既存CSVの期間区分を確認**（ファイル名の `NN-朝代-開始-終了` が基準）:
   ```bash
   ls docs/samples/01-China/*.csv | sed 's/.*china-//;s/\.csv//'
   ```
2. **行定義**: 名前=朝代名（既存CSVと同一表記）、肩書=種別（統一王朝/並立王朝/分裂期/武家政治/近世…）、
   期間=既存区分と完全一致させる
3. **エッジ定義**:
   - `継承` = 同系の継続（西周→東周、共和政ローマ→ローマ帝国、飛鳥→奈良）
   - `朝代更换` = 王朝交代・征服・独立（夏→商、明→清、イギリス→アメリカ）
   - 日本は万世一系のため**すべて継承**で朝代更换は使わない
4. **検証**（必須）:
   ```bash
   node -e "
   const fs = require('fs');
   const lines = fs.readFileSync('docs/samples/01-China/china-dynasties.csv','utf8').split('\n').filter(Boolean);
   const rows = lines.slice(1).map(l=>l.split(','));
   const names = new Set(rows.map(r=>r[0]));
   console.log('重複:', rows.length - names.size);
   let phantom = [];
   for (const r of rows) for (const col of [3,4])
     for (const ref of (r[col]||'').split(/[；;]/).filter(Boolean))
       if (!names.has(ref.trim())) phantom.push(r[0]+'→'+ref);
   console.log('ファントム参照:', phantom);
   "
   ```
   - 重複名0・ファントム参照0・期間形式 `前?数字-前?数字` を確認
5. **人名レベルの継承CSV（china-imperial-succession.csv等）との突合**:
   - 肩書=朝代名の行を期間で集計（最初の開始〜最後の終了）し、関係図CSVの期間と比較
   - 例: 東周は「東周·春秋」「東周·戰國」を統合して比較

### 注意点
- 後漢（東漢25-220）と後漢（五代947-950）のような**同名朝代は既存慣例に従い区別**する
  （既存CSVは 東漢=25-220、後漢=947-950）
- 戦国七雄（戰國·楚 等）のような**州国レベルの区分は関係図CSVに含めない**
- 参照先の名前は必ず同一CSV内の行に存在させる（自動生成ノードに頼らない）

---

## 3. Agent向けチェックリスト

### データ準備（CSV作成）完了時
- [ ] 対象・粒度・情報の指示を満たしている
- [ ] 期間が既存CSVの区分と一致（ファイル名の年代を基準）
- [ ] 重複名0・ファントム参照0（0-4の検証コマンド）
- [ ] 伝説人物（三皇五帝など）は正統な構成（三皇=3名・五帝=5名、女媧は別表記）
- [ ] 生没年が不確実なものは「约」付きで概算と明記

### 画像パイプライン完了時
- [ ] `pgrep -f "fetch-images|gen-ai-images"` が空（全プロセス停止）
- [ ] manifest が正規化済み（`normalize-manifest.mjs` 実行済み）
- [ ] done のファイルが全件PILで開ける（破損0）
- [ ] rejected は「実画像が存在しない」ことの確認済み（検索2回+AI生成で代替不可）
- [ ] 画像は `images/` 配下のみ（CSV直下にはコピーしない）
- [ ] AI生成画像は `source:"ai"` 付き

### 関係図CSV完了時
- [ ] 期間が既存CSVの区分と完全一致
- [ ] 重複名0・ファントム参照0
- [ ] 人名レベルの継承CSVとの突合で不一致0
- [ ] 同系継続は`継承`、交代・征服は`朝代更换`で区別

### 環境メモ
- 画像生成APIキーは `~/work/legacy/01-ghost-front/apps/host/.env.development` の
  `GLM_API_KEY`（CogView）と `DASHSCOPE_API_KEY`（Qwen）
- Wikimedia は同一IPから並行プロセスを回すと 429 で互いに throttling する
  → **並行実行せず、1シリーズずつ順番に**
- 画像の作業は `docs/samples/` 配下のみ（01-ghost-front を汚染しない）
