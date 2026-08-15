// fetch-images.mjs — 各CSVの人物画像を Wikimedia Commons / Wikipedia から検索・ダウンロード
// 対象: docs/samples/{01-China,02-Japan,03-West}/*.csv の「名前」列（重複除去）
// 出力: docs/samples/images/{series}/{name}.{ext} + manifest.json（出典URL・ライセンス・作者）
//
// 使い方:
//   node fetch-images.mjs                 # 全シリーズ（03-West → 02-Japan → 01-China の順）
//   node fetch-images.mjs 03-West         # 特定シリーズのみ
//   node fetch-images.mjs 03-West 10      # 先頭10名のみ（スモークテスト）
//
// 途中で止めても manifest.json を読んで再開する（ダウンロード済みはスキップ）。
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { NAMES as WEST_NAMES } from './west-trans.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const UA = 'FamilyHistoryChart/1.0 (local docs sample script; offline research use)'
const COMMONS = 'https://commons.wikimedia.org/w/api.php'
const IMG_ROOT = path.join(DIR, 'images')
const SLEEP_MS = 1500 // Wikimedia 推奨のレート制限に配慮 + 429抑制のための余裕

const SERIES = [
  { dir: '03-West',  primary: 'ja', wikiChain: ['en.wikipedia.org'],        enMap: WEST_NAMES },
  { dir: '02-Japan', primary: 'ja', wikiChain: ['ja.wikipedia.org', 'en.wikipedia.org'], enMap: null },
  { dir: '01-China', primary: 'zh', wikiChain: ['zh.wikipedia.org', 'en.wikipedia.org'], enMap: null },
]

// ── 除外・優先のキーワード（タイトル/説明文ベース）────────────────────────
const REJECT = new RegExp(
  'temple|shrine|monument|statue|bust|coat of arms|coatofarms|flag|seal|stamp|coin|banknote|' +
  'signature|tomb|grave|museum|gallery|genealogy|family tree|diagram|logo|plaque|poster|pagoda|' +
  'ruins|ruin|landmark|aerial|exterior|interior view|location map|karte|floor plan|' +
  'worm|taenia|虫|restaurant|餐厅|餐馆|饭馆|hotel|旅馆|recipe|hymn|' +
  '寺|神社|仏像|銅像|石像|塑像|雕像|墓|陵|碑|匾|塔|遗址|遗迹|地图|邮票|钱币|雕塑|印章|' +
  '像$|印$|圖$|图$|^[^/]*寺庙|^[^/]*庙',
  'i')
const PREFER = /portrait|painting|fresco|肖像|絵|画|御影|御真影|真影|写真|photo|bust of|b%C3%BCste/i
const RASTER = /image\/(jpeg|png|webp)/

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stripHtml = (s) => (s || '').replace(/<[^>]+>/g, '').trim()

// 429連発でペースを自動調整（成功で徐々に戻す）
let pace = 1
const paceUp = () => { pace = Math.min(8, pace * 2) }
const paceDown = () => { pace = Math.max(1, pace * 0.9) }

async function apiGet(url, params, tries = 3) {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', ...params })
  for (let i = 1; i <= tries; i++) {
    const res = await fetch(`${url}?${q}`, { headers: { 'User-Agent': UA } })
    if (res.status === 429 || res.status >= 500) {
      paceUp()
      const wait = res.headers.get('retry-after') ? Math.min(Number(res.headers.get('retry-after')), 60) * 1000 : 3000 * i
      console.log(`  ⚠ API ${res.status}: ${wait}ms待機して再試行`)
      await sleep(wait)
      continue
    }
    if (!res.ok) throw new Error(`API ${res.status}: ${url}`)
    return await res.json()
  }
  throw new Error(`API 失敗: ${url}`)
}

// Commons のファイル検索（名前空間6）→ 候補をスコアリング
async function commonsSearch(term) {
  const data = await apiGet(COMMONS, {
    action: 'query', generator: 'search',
    gsrsearch: `"${term}"`, gsrnamespace: 6, gsrlimit: 10,
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: 800,
  })
  return (data.query?.pages || []).map((p) => {
    const ii = p.imageinfo?.[0]
    if (!ii || !RASTER.test(ii.mime || '')) return null
    const desc = `${p.title} ${stripHtml(ii.extmetadata?.ImageDescription?.value)} ${stripHtml(ii.extmetadata?.Categories?.value) || ''}`
    if (REJECT.test(desc)) return null
    let score = 0
    if (p.title.includes(term.replace(/"/g, ''))) score += 80
    if (PREFER.test(desc)) score += 12
    const w = ii.width || 0, h = ii.height || 0
    if (w >= 500) score += 5
    if (h > 0 && w / h >= 0.55 && w / h <= 1.7) score += 8
    if ((ii.size || 0) < 60000) score -= 5
    return {
      score,
      title: p.title,
      url: (ii.thumburl || ii.url).replace(/[?&]utm.*$/, ''),
      original: ii.url.replace(/[?&]utm.*$/, ''),
      width: ii.thumbwidth || w, height: ii.thumbheight || h,
      license: stripHtml(ii.extmetadata?.LicenseShortName?.value) || '',
      artist: stripHtml(ii.extmetadata?.Artist?.value) || '',
      descriptionurl: ii.descriptionurl || '',
    }
  }).filter(Boolean)
}

// 各言語Wikipedia の人物記事画像（pageimages）→ 同様にフィルタ
async function wikiFallback(wikis, term) {
  for (const wiki of wikis) {
    const data = await apiGet(`https://${wiki}/w/api.php`, {
      action: 'query', generator: 'search', gsrsearch: `"${term}"`, gsrlimit: 5,
      prop: 'pageimages', piprop: 'thumbnail|name', pithumbsize: 800,
    })
    for (const p of (data.query?.pages || [])) {
      const t = p.thumbnail
      if (!t || REJECT.test(`${p.title} ${p.pageimage || ''}`)) continue
      let license = '', artist = '', durl = ''
      try {
        const meta = await apiGet(COMMONS, {
          action: 'query', titles: `File:${p.pageimage}`,
          prop: 'imageinfo', iiprop: 'url|extmetadata',
        })
        const ii = meta.query?.pages?.[0]?.imageinfo?.[0]
        license = stripHtml(ii?.extmetadata?.LicenseShortName?.value) || ''
        artist = stripHtml(ii?.extmetadata?.Artist?.value) || ''
        durl = ii?.descriptionurl || ''
      } catch { /* ライセンス取得失敗は unknown のまま */ }
      return { score: 40, title: p.pageimage, url: t.source.replace(/[?&]utm.*$/, ''),
               original: t.source.replace(/[?&]utm.*$/, ''), width: t.width, height: t.height,
               license, artist, descriptionurl: durl }
    }
  }
  return null
}

// ── 名前収集 ────────────────────────────────────────────────
function collectNames(seriesDir) {
  const dir = path.join(DIR, seriesDir)
  const names = new Set()
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.csv'))) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '')
    const lines = text.trim().split(/\r?\n/)
    for (const line of lines.slice(1)) {
      const name = line.split(',')[0].replace(/^"|"$/g, '')
      if (name) names.add(name)
    }
  }
  return [...names]
}

const safeFile = (name) => String(name)
  .replace(/[\\/:*?"<>|#]/g, '_')
  .replace(/\.\./g, '_')
  .replace(/[\s.]+$/, '')
  .slice(0, 80)

async function downloadFile(url, dest) {
  for (let i = 1; i <= 4; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) { fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer())); return }
    if (res.status === 429 || res.status >= 500) {
      paceUp()
      const wait = res.headers.get('retry-after') ? Math.min(Number(res.headers.get('retry-after')), 60) * 1000 : 4000 * i
      console.log(`  ⚠ DL ${res.status}: ${wait}ms待機して再試行`)
      await sleep(wait)
      continue
    }
    throw new Error(`ダウンロード失敗 ${res.status}: ${url}`)
  }
  throw new Error(`ダウンロード失敗(4回429): ${url}`)
}

async function processName(name, series, outDir, manifest, missingLog, enhanced = false) {
  // enhanced: rejected 再検索用 — 肖像を明示したクエリを追加
  const en = series.enMap?.[name]?.en
  const terms = (enhanced
    ? [name, en ? `${en} portrait` : `${name} 肖像`, en || '']
    : [name, en || '']).filter(Boolean)
  let best = null
  for (const term of terms) {
    const cands = await commonsSearch(term)
    const top = cands.sort((a, b) => b.score - a.score)[0]
    if (top && (!best || top.score > best.score)) best = top
  }
  if (!best) best = await wikiFallback(series.wikiChain, name)
  if (!best) {
    manifest.push({ name, status: 'missing' })
    missingLog.push(name)
    return
  }
  const ext = /\.(jpe?g|png|webp)$/i.test(best.url) ? path.extname(new URL(best.url).pathname) : '.jpg'
  const dest = path.join(outDir, safeFile(name) + (ext === '.jpeg' ? '.jpg' : ext))
  if (!fs.existsSync(dest)) {
    await downloadFile(best.url, dest)
    await sleep(300)
  }
  manifest.push({
    name, status: 'done', file: path.basename(dest),
    title: best.title, width: best.width, height: best.height,
    url: best.original, descriptionurl: best.descriptionurl,
    license: best.license || 'unknown', artist: best.artist || '',
  })
}

async function runSeries(series, limit, rejMode = false) {
  const names = collectNames(series.dir)
  const outDir = path.join(IMG_ROOT, series.dir)
  fs.mkdirSync(outDir, { recursive: true })
  const manifestFile = path.join(outDir, 'manifest.json')
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : []
  const done = new Set(manifest.filter((m) => m.status === 'done' && m.file && fs.existsSync(path.join(outDir, m.file))).map((m) => m.name))
  const rejected = new Set(manifest.filter((m) => m.status === 'rejected').map((m) => m.name))
  const missingLog = []

  const missing = new Set(manifest.filter((m) => m.status === 'missing').map((m) => m.name))
  let targets
  if (rejMode) {
    targets = names.filter((n) => rejected.has(n))
  } else {
    // 通常モード: done / rejected / missing をスキップ（rejected は rej モードでのみ再検索）
    targets = limit ? names.slice(0, limit) : names.filter((n) => !done.has(n) && !rejected.has(n) && !missing.has(n))
  }
  console.log(`[${series.dir}] 対象${names.length}名（うち未取得${targets.length}名）`)

  for (let i = 0; i < targets.length; i++) {
    const name = targets[i]
    try {
      await processName(name, series, outDir, manifest, missingLog, rejMode)
    } catch (e) {
      manifest.push({ name, status: 'error', error: String(e).slice(0, 200) })
      console.log(`  ✗ ${name}: ${e.message?.slice(0, 100) || e}`)
    }
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1))
    if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      const got = manifest.filter((m) => m.status === 'done').length
      console.log(`[${series.dir}] ${i + 1}/${targets.length} 取得${got} 欠落${missingLog.length} pace=${pace.toFixed(1)}`)
    }
    await sleep(SLEEP_MS * pace + Math.random() * 500) // ジッター+429連発時は自動減速
    paceDown()
  }
  console.log(`[${series.dir}] 完了: 取得${manifest.filter((m) => m.status === 'done').length} 欠落${missingLog.length} エラー${manifest.filter((m) => m.status === 'error').length}`)
  if (missingLog.length) {
    console.log(`[${series.dir}] 欠落 ${missingLog.length}名（先頭20）: ${missingLog.slice(0, 20).join('、')}`)
  }
}

const arg = process.argv[2]
const limit = process.argv[3] ? Number(process.argv[3]) : 0
const rejMode = process.argv[3] === 'rej' || process.argv[4] === 'rej'
const seriesList = arg ? SERIES.filter((s) => s.dir === arg) : SERIES
if (!seriesList.length) { console.error(`不明なシリーズ: ${arg}`); process.exit(1) }

for (const s of seriesList) await runSeries(s, limit, rejMode)
