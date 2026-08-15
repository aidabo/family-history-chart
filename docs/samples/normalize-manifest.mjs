// normalize-manifest.mjs — manifest.json を名前ごとに1エントリへ正規化
// 優先順: source:'ai' > done(ファイル実在) > missing > rejected > error
// 使い方: node normalize-manifest.mjs <series>
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const series = process.argv[2] || '01-China'
const dir = path.join(DIR, 'images', series)
const manifestFile = path.join(dir, 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))

const byName = {}
for (const e of manifest) {
  const cur = byName[e.name]
  if (!cur) { byName[e.name] = e; continue }
  // 優先順で比較
  const rank = (x) => {
    if (x.source === 'ai') return 0
    if (x.status === 'done' && x.file && fs.existsSync(path.join(dir, x.file))) return 1
    if (x.status === 'done') return 2
    if (x.status === 'missing') return 3
    if (x.status === 'rejected') return 4
    return 5
  }
  if (rank(e) < rank(cur)) byName[e.name] = e
}

const out = Object.values(byName)
fs.writeFileSync(manifestFile, JSON.stringify(out, null, 1))
const st = {}
for (const e of out) st[e.status] = (st[e.status] || 0) + 1
const ai = out.filter((e) => e.source === 'ai').length
console.log(`${series}: ${out.length}名（旧エントリ ${manifest.length}）`, JSON.stringify(st), `AI=${ai}`)
