// Generate japan-thinkers.csv — 日本の思想家・影響力人物（単一ファイル）
// 中国の china-thinkers.csv と同じ構造（師→custom 関係「師」、著作→ノード化「著作」）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { THINKERS } from './japan-data.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(DIR, '02-Japan')

// 著作は「；」「空白」「《の直前」で分割（《三教指归》《十住心论》 → 別ノードに）
const splitWorks = (v) => (v || '').split(/[；;]+|\s+|(?=《)/).map((s) => s.trim()).filter(Boolean)

// 検証
const names = new Set(THINKERS.map((p) => p[0]))
if (names.size !== THINKERS.length) {
  const dup = THINKERS.map((p) => p[0]).filter((n, i, a) => a.indexOf(n) !== i)
  throw new Error(`名前の重複: ${[...new Set(dup)].join(', ')}`)
}
const badTeacher = []
for (const p of THINKERS) {
  for (const t of (p[6] || '').split(/[；;]/).map((s) => s.trim()).filter(Boolean)) {
    if (!names.has(t)) badTeacher.push(`${p[0]}→${t}`)
  }
}
if (badTeacher.length) throw new Error(`未解決の師参照: ${badTeacher.join(', ')}`)
const workCollision = []
for (const p of THINKERS) {
  for (const w of splitWorks(p[8])) {
    if (names.has(w)) workCollision.push(`${p[0]}→${w}`)
  }
}
if (workCollision.length) throw new Error(`人物名と衝突する著作: ${workCollision.join(', ')}`)

// 生年順ソート（前N→負数、約除去、空欄は没年）
const yearOf = (v) => Number((v || '').replace(/[约約]/g, '').replace(/^前/, '-'))
const sortKey = (p) => {
  const b = yearOf(p[2])
  return p[2] !== '' && Number.isFinite(b) ? b : yearOf(p[3])
}
const rows = [...THINKERS].sort((a, b) => sortKey(a) - sortKey(b))
const header = '名前,性別,生年,没年,時代,肩書,師,学派,著作,期間,メモ'
const csv = [header, ...rows.map((r) => [...r.slice(0, 8), splitWorks(r[8]).join('；'), r[9], r[10]].join(','))].join('\n')
const fname = 'japan-thinkers.csv'
fs.writeFileSync(path.join(OUT, fname), csv)

const works = new Set(rows.flatMap((p) => splitWorks(p[8])))
const teachers = new Set(rows.flatMap((p) => (p[6] || '').split(/[；;]/).map((s) => s.trim()).filter(Boolean)))
console.log(`OK: ${fname}（${rows.length}人）→ ${OUT}`)
console.log(`  師エッジ ${teachers.size}人・著作ノード ${works.size}件`)
