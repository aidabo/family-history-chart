// gen-ai-images.mjs — 実画像が存在しない人物の肖像を AI（Qwen wanx 優先 / GLM CogView）で生成
// 使い方:
//   node gen-ai-images.mjs [名前...] [--series=01-China|02-Japan|03-West] [--list=FILE] [--force]
// 生成先: images/{series}/{名前}.png（manifest に source:'ai' で記録、透かしは下端80pxトリミングで除去）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFile } from 'child_process'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const SERIES = process.argv.find((a) => a.startsWith('--series='))?.slice(9) || '01-China'
const IMG = path.join(DIR, 'images', SERIES)
const KEY = process.env.GLM_API_KEY
const QWEN_KEY = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY

// 地域別スタイル
const STYLES = {
  '01-China': {
    prefix: '中国传统工笔画风格的历史人物肖像画',
    era: '中国王朝时代',
    outfits: [
      { re: /^(帝|皇帝|太上皇)$/, outfit: '帝王の竜袍（龍の文様入りの明黄色の礼服）' },
      { re: /^(皇后|皇太后|王妃|公主)$/, outfit: '后妃の礼服（刺繍入りの華麗な宮廷服と頭飾り）' },
      { re: /^(大将軍|上将军|大元帅|大都督|将军|司马|大司马)$/, outfit: '将軍の甲冑（武将の鎧と兜）' },
      { re: /^(宰相|丞相|相国|太傅|太保|太师|太尉|尚书令|中书令|御史大夫|司徒|司空|大夫)$/, outfit: '官服（文官の朝服と官帽）' },
      { re: /^三皇|五帝/, outfit: '上古の王者の皮衣（原始的な王者の装束）' },
    ],
    fallback: '古代中国の伝統的な衣装',
    sex: (g) => (g === '女' ? '女性' : '男性'),
  },
  '02-Japan': {
    prefix: '日本の伝統的な大和絵・浮世絵風の肖像画',
    era: '日本歴史時代',
    outfits: [
      { re: /^(天皇|帝|太上天皇)$/, outfit: '天皇の黄櫨染御袍（束帯姿）' },
      { re: /^(皇后|皇太后|妃|后)$/, outfit: '后妃の十二単（唐衣裳）' },
      { re: /^(将軍|執権|管領|征夷大将軍)$/, outfit: '武家の鎧と陣羽織（戦国武将姿）' },
      { re: /^(摂政|関白|太政大臣|大臣|中納言|大納言)$/, outfit: '公家の束帯・衣冠姿' },
      { re: /^(神|神代)/, outfit: '神話の神の装束（古代の神衣）' },
      { re: /^(僧|僧侶|法師|上人)$/, outfit: '僧侶の衣（墨染の僧衣）' },
      { re: /^(歌人|詩人|文人|学者|儒者|国学者)$/, outfit: '和歌の文人の直衣・狩衣姿' },
    ],
    fallback: '日本の伝統的な衣装（直衣・狩衣）',
    sex: (g) => (g === '女' ? '女性' : '男性'),
  },
  '03-West': {
    prefix: '18世紀西洋の古典的な油絵肖像画',
    era: '西洋歴史時代',
    outfits: [
      { re: /^(皇帝|国王|女王|大帝)$/, outfit: '王冠と紫のマント（王権の象徴を持つ）' },
      { re: /^(王妃|皇后|皇妃)$/, outfit: '宮廷の豪華なドレスと宝石' },
      { re: /^(教皇|法王)$/, outfit: '教皇冠（ティアラ）と法衣' },
      { re: /^(将軍|大将|元帥)$/, outfit: '軍服または甲冑' },
      { re: /^(首相|大統領|宰相|政治家)$/, outfit: '18世紀の貴族服（カツラと襟飾り）' },
      { re: /^(神|神話)/, outfit: '古典ギリシア風の神の衣' },
      { re: /^(哲学者|学者|思想家|作家|詩人|科学者)$/, outfit: '学者の服装（マントとシャツ）' },
    ],
    fallback: '西洋の伝統的な服装',
    sex: (g) => (g === '女' ? '女性' : '男性'),
  },
}
const STYLE = STYLES[SERIES] || STYLES['01-China']

const safeFile = (s) => s.replace(/[\\/:*?"<>|#]/g, '_').replace(/[. ]+$/g, '').slice(0, 80)

// プロンプト構築（CSV情報から）
function buildPrompt(name, gender, memo, ken) {
  const t = STYLE.outfits.find((x) => x.re.test(ken || '')) || { outfit: STYLE.fallback }
  const sex = STYLE.sex(gender)
  const memoDesc = memo ? `（${memo.slice(0, 60)}）` : ''
  return `${STYLE.prefix}。${STYLE.era}的${sex}，身着${t.outfit}，端正坐姿，面部特征清晰，神态庄重。水墨淡彩，浅色背景，仅上半身。${memoDesc}`
}

// CSVから名前→(性別,肩書,メモ) のマップ（ヘッダー行から列位置を自動検出）
function loadCsvInfo() {
  const map = {}
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.csv'))
  for (const f of files) {
    const lines = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')
    const head = (lines[0] || '').split(',')
    const ci = (name) => head.indexOf(name)
    const iName = ci('名前'), iSex = ci('性別'), iKen = ci('肩書'), iMemo = ci('メモ')
    if (iName < 0) continue
    for (const line of lines.slice(1)) {
      const c = line.split(',')
      if (!c[0]) continue
      const name = c[iName]
      map[name] = {
        gender: iSex >= 0 ? (c[iSex] || '') : '',
        ken: iKen >= 0 ? (c[iKen] || '').trim() : '',
        memo: iMemo >= 0 ? (c[iMemo] || '').trim() : '',
      }
    }
  }
  return map
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Qwen qwen-image-2.0 — 優先プロバイダ（multimodal同期エンドポイント）
async function generateQwen(prompt) {
  const base = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
  const res = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${QWEN_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen-image-2.0',
      input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
      parameters: { size: '1024*1024', n: 1 },
    }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Qwen ${res.status}: ${body.slice(0, 100)}`)
  const d = JSON.parse(body)
  const imgUrl = d.output?.choices?.[0]?.message?.content?.[0]?.image
  if (!imgUrl) throw new Error('Qwen: no image url in response')
  const img = await fetch(imgUrl)
  if (!img.ok) throw new Error(`Qwen DL ${img.status}`)
  return Buffer.from(await img.arrayBuffer())
}

// GLM CogView — フォールバック
async function generateGLM(prompt) {
  const res = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'cogview-3-flash', prompt, size: '1024x1024' }),
  })
  if (!res.ok) throw new Error(`GLM ${res.status}: ${(await res.text()).slice(0, 120)}`)
  const d = await res.json()
  const imgUrl = d.data?.[0]?.url
  if (!imgUrl) throw new Error('GLM: no url in response')
  const img = await fetch(imgUrl)
  if (!img.ok) throw new Error(`GLM DL ${img.status}`)
  return Buffer.from(await img.arrayBuffer())
}

async function generate(prompt) {
  if (QWEN_KEY) {
    try { return await generateQwen(prompt) }
    catch (e) { console.log(`    （Qwen失敗 → GLMへ: ${e.message.slice(0, 60)}）`) }
  }
  return generateGLM(prompt)
}

// 透かし除去（下端80pxトリミング）
function cropWatermark(buf) {
  return new Promise((resolve, reject) => {
    execFile('python3', ['-c', `
from PIL import Image
import sys, io
im = Image.open(io.BytesIO(sys.stdin.buffer.read())).convert('RGB')
w, h = im.size
im = im.crop((0, 0, w, h - 80))
out = io.BytesIO()
im.save(out, format='PNG')
sys.stdout.buffer.write(out.getvalue())
`], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('crop: ' + stderr.slice(0, 100)))
      resolve(stdout)
    }).stdin.end(buf)
  })
}

async function main() {
  const argv = process.argv.slice(2)
  const onlyNames = argv.filter((a) => !a.startsWith('--'))
  const listFile = argv.find((a) => a.startsWith('--list='))?.slice(7)
  const force = argv.includes('--force')
  const info = loadCsvInfo()

  let targets = onlyNames
  if (!targets.length) {
    const file = listFile || '/tmp/ai-gen-main.txt'
    targets = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  }
  fs.mkdirSync(IMG, { recursive: true })
  const manifestFile = path.join(IMG, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  const doneNames = new Set(manifest.filter((m) => m.source === 'ai').map((m) => m.name))
  const todo = force ? targets : targets.filter((n) => !doneNames.has(n))
  console.log(`[${SERIES}] 対象 ${targets.length} 名（うち生成済み ${targets.length - todo.length}、今回 ${todo.length}）`)

  let ok = 0, fail = 0
  for (let i = 0; i < todo.length; i++) {
    const name = todo[i]
    try {
      const prompt = buildPrompt(name, info[name]?.gender, info[name]?.memo, info[name]?.ken)
      const buf = await generate(prompt)
      const cropped = await cropWatermark(buf)
      const fname = `${safeFile(name)}.png`
      fs.writeFileSync(path.join(IMG, fname), cropped)
      // 破損チェック: PILで開けなければ失敗扱い
      await new Promise((resolve, reject) => {
        execFile('python3', ['-c', `
from PIL import Image
import sys
Image.open(sys.argv[1]).load()
`, path.join(IMG, fname)], (err) => (err ? reject(new Error('verify fail')) : resolve()))
      })
      // manifest 更新（同名の全エントリを除去して新エントリを追加）
      for (let j = manifest.length - 1; j >= 0; j--) {
        if (manifest[j].name === name) manifest.splice(j, 1)
      }
      manifest.push({ name, status: 'done', file: fname, source: 'ai', title: 'AI生成（' + STYLE.prefix + '）', license: 'AI生成', artist: 'Qwen wanx / GLM CogView', width: 1024, height: 944 })
      fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1))
      ok++
      console.log(`  ✓ ${name} (${i + 1}/${todo.length})`)
    } catch (e) {
      fail++
      console.log(`  ✗ ${name}: ${e.message.slice(0, 80)}`)
    }
    await sleep(1500 + Math.random() * 1000)
  }
  console.log(`[${SERIES}] 完了: 成功 ${ok} / 失敗 ${fail}`)
}

if (!KEY) { console.error('GLM_API_KEY が設定されていません'); process.exit(1) }
main()
