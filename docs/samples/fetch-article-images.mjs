// fetch-article-images.mjs — Wikipedia記事のリード画像（= その人物の肖像）を直接取得
// 使い方: node fetch-article-images.mjs <series> <wiki> '[[csv名, 記事名], ...]'
//   ja.wikipedia の記事リード画像は、存在すれば確実にその人物（肖像画/写真）である。
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const UA = 'FamilyHistoryChart/1.0 (local docs sample script; offline research use)'
const COMMONS = 'https://commons.wikimedia.org/w/api.php'
const [series, wiki, pairsJson] = process.argv.slice(2)
const pairs = JSON.parse(pairsJson)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const dir = path.join(DIR, 'images', series)
const manifestFile = path.join(dir, 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))

async function apiGet(url, params, tries = 4) {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', ...params })
  for (let i = 1; i <= tries; i++) {
    const res = await fetch(`${url}?${q}`, { headers: { 'User-Agent': UA } })
    if (res.status === 429) { const w = Math.min((Number(res.headers.get('retry-after')) || 10) * 1000, 60000); await sleep(w); continue }
    if (!res.ok) throw new Error(`API ${res.status}`)
    return await res.json()
  }
  throw new Error('API 失敗')
}

// 1. 記事のリード画像名を取得
const pageimages = new Map()
for (let i = 0; i < pairs.length; i += 30) {
  const chunk = pairs.slice(i, i + 30)
  const data = await apiGet(`https://${wiki}/w/api.php`, {
    action: 'query', titles: chunk.map((p) => p[1]).join('|'),
    prop: 'pageimages', piprop: 'thumbnail|name', pithumbsize: 800,
  })
  for (const p of data.query?.pages || []) {
    if (!p.missing && p.thumbnail) pageimages.set(p.title, { thumb: p.thumbnail.source, file: p.pageimage })
  }
  await sleep(1200)
}

// 2. ファイルのライセンス・URLを Commons から（バッチ）
const fileInfos = new Map()
const files = [...new Set([...pageimages.values()].map((v) => v.file))]
for (let i = 0; i < files.length; i += 30) {
  const chunk = files.slice(i, i + 30)
  const data = await apiGet(COMMONS, {
    action: 'query', titles: chunk.map((f) => `File:${f}`).join('|'),
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata',
  })
  for (const p of data.query?.pages || []) {
    const ii = p.imageinfo?.[0]
    if (!p.missing && ii && /image\/(jpeg|png|webp)/.test(ii.mime)) {
      fileInfos.set(p.title.slice(5).replace(/_/g, ' '), {
        url: ii.thumburl || ii.url,
        original: ii.url, width: ii.thumbwidth || ii.width, height: ii.thumbheight || ii.height,
        license: (ii.extmetadata?.LicenseShortName?.value || '').replace(/<[^>]+>/g, '').trim() || 'unknown',
        artist: (ii.extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '').trim() || '',
        descriptionurl: ii.descriptionurl || '',
      })
    }
  }
  await sleep(1200)
}

// 3. ダウンロード（リトライ付き）→ manifest 置換
const safeFile = (name) => String(name)
  .replace(/[\\/:*?"<>|#]/g, '_')
  .replace(/\.\./g, '_')
  .replace(/[\s.]+$/, '')
  .slice(0, 80)
let ok = 0
const fail = []
for (const [csvName, article] of pairs) {
  const pi = pageimages.get(article)
  if (!pi) { fail.push(`${csvName} ← ${article}（リード画像なし）`); continue }
  const info = fileInfos.get(pi.file.replace(/_/g, ' '))
  if (!info) { fail.push(`${csvName} ← ${article}:${pi.file}（情報取得不可）`); continue }
  const ext = path.extname(new URL(info.original).pathname) || '.jpg'
  const dest = path.join(dir, safeFile(csvName) + (ext === '.jpeg' ? '.jpg' : ext))
  let saved = false
  for (let i = 1; i <= 5 && !saved; i++) {
    const res = await fetch(info.url.replace(/[?&]utm.*$/, ''), { headers: { 'User-Agent': UA } })
    if (res.ok) { fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer())); saved = true; break }
    if (res.status === 429 || res.status >= 500) {
      const w = Math.min((Number(res.headers.get('retry-after')) || 8) * 1000 * i, 60000)
      await sleep(w)
      continue
    }
    break
  }
  if (!saved) { fail.push(`${csvName} ← ${pi.file} (DL)`); continue }
  for (let i = manifest.length - 1; i >= 0; i--) if (manifest[i].name === csvName) manifest.splice(i, 1)
  manifest.push({ name: csvName, status: 'done', file: path.basename(dest), title: `File:${pi.file}`,
    width: info.width, height: info.height, url: info.original.replace(/[?&]utm.*$/, ''),
    descriptionurl: info.descriptionurl, license: info.license, artist: info.artist })
  ok++
  console.log(`  ✓ ${csvName} ← ${pi.file}`)
  await sleep(1400)
}
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1))
console.log(`${series}(${wiki}): 取得 ${ok}/${pairs.length}`)
if (fail.length) console.log('失敗/欠落:\n  ' + fail.join('\n  '))
