// fetch-manual.mjs — 確実な Commons ファイル名を指定して取得（検索に頼らず）
// 使い方: node fetch-manual.mjs 03-West '[["アンリ4世","File:Henri IV of France.jpg"], ...]'
//   → 存在するものをダウンロードし、manifest を更新（エントリ置換）。存在しないものは表示のみ。
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const UA = 'FamilyHistoryChart/1.0 (local docs sample script; offline research use)'
const COMMONS = 'https://commons.wikimedia.org/w/api.php'
const [series, pairsJson] = process.argv.slice(2)
const pairs = JSON.parse(pairsJson)
if (!series || !pairs.length) { console.error('usage: node fetch-manual.mjs <series> <json>'); process.exit(1) }

const dir = path.join(DIR, 'images', series)
const manifestFile = path.join(dir, 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function apiGet(params, tries = 3) {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', ...params })
  for (let i = 1; i <= tries; i++) {
    const res = await fetch(`${COMMONS}?${q}`, { headers: { 'User-Agent': UA } })
    if (res.status === 429) { const w = (Number(res.headers.get('retry-after')) || 10) * 1000; await sleep(w); continue }
    if (!res.ok) throw new Error(`API ${res.status}`)
    return await res.json()
  }
  throw new Error('API 失敗')
}

// 1. 存在確認（バッチ）
const exists = new Map()
for (let i = 0; i < pairs.length; i += 30) {
  const chunk = pairs.slice(i, i + 30)
  const data = await apiGet({ action: 'query', titles: chunk.map((p) => p[1]).join('|'),
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: 800 })
  for (const p of data.query?.pages || []) {
    const ii = p.imageinfo?.[0]
    if (!p.missing && ii && /image\/(jpeg|png|webp)/.test(ii.mime)) {
      exists.set(p.title, {
        url: (ii.thumburl || ii.url).replace(/[?&]utm.*$/, ''),
        original: ii.url.replace(/[?&]utm.*$/, ''),
        width: ii.thumbwidth || ii.width, height: ii.thumbheight || ii.height,
        license: (ii.extmetadata?.LicenseShortName?.value || '').replace(/<[^>]+>/g, '').trim() || 'unknown',
        artist: (ii.extmetadata?.Artist?.value || '').replace(/<[^>]+>/g, '').trim() || '',
        descriptionurl: ii.descriptionurl || '',
      })
    }
  }
  await sleep(1500)
}

// 2. ダウンロードして manifest 置換
const safeFile = (name) => String(name)
  .replace(/[\\/:*?"<>|#]/g, '_')
  .replace(/\.\./g, '_')
  .replace(/[\s.]+$/, '')
  .slice(0, 80)
let ok = 0, miss = []
for (const [name, title] of pairs) {
  const info = exists.get(title)
  if (!info) { miss.push(`${name} ← ${title}`); continue }
  const ext = path.extname(new URL(info.original).pathname) || '.jpg'
  const dest = path.join(dir, safeFile(name) + (ext === '.jpeg' ? '.jpg' : ext))
  // 既存の誤ったファイル（他エントリの物）を確認: 同じ dest を前エントリが持つ場合は上書きでOK
  let saved = false
  for (let i = 1; i <= 5 && !saved; i++) {
    const res = await fetch(info.url, { headers: { 'User-Agent': UA } })
    if (res.ok) { fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer())); saved = true; break }
    if (res.status === 429 || res.status >= 500) {
      const w = (Number(res.headers.get('retry-after')) || 8) * 1000 * i
      console.log(`  ⚠ DL 429: ${w}ms待機（${name}）`)
      await sleep(Math.min(w, 60000))
      continue
    }
    break
  }
  if (!saved) { console.log(`  ✗ DL失敗: ${name}`); miss.push(`${name} ← ${title} (DL)`); continue }
  // manifest 置換: 同名エントリを削除して追加
  for (let i = manifest.length - 1; i >= 0; i--) if (manifest[i].name === name) manifest.splice(i, 1)
  manifest.push({ name, status: 'done', file: path.basename(dest), title,
    width: info.width, height: info.height, url: info.original, descriptionurl: info.descriptionurl,
    license: info.license, artist: info.artist })
  ok++
  await sleep(1200)
}
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1))
console.log(`${series}: 取得 ${ok}/${pairs.length}`)
if (miss.length) console.log('失敗/欠落:\n  ' + miss.join('\n  '))
