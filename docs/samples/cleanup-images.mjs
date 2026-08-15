// cleanup-images.mjs — 出鱈目な画像を削除し manifest を status:'rejected' にする
// 使い方: node cleanup-images.mjs 03-West ディオニュソス コンスタンティノス11世 ...
//        node cleanup-images.mjs 03-West < names.txt  （改行区切りの名前リスト）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const [series, ...names] = process.argv.slice(2)
if (!series || !names.length) { console.error('usage: cleanup-images.mjs <series> <name>...'); process.exit(1) }

const dir = path.join(DIR, 'images', series)
const manifestFile = path.join(dir, 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))

let removed = 0
for (const name of names) {
  const ms = manifest.filter((x) => x.name === name)
  if (!ms.length) { console.log(`  ? 未登録: ${name}`); continue }
  for (const m of ms) {
    if (m.file && fs.existsSync(path.join(dir, m.file))) {
      fs.unlinkSync(path.join(dir, m.file))
      console.log(`  ✗ 削除: ${name} (${m.file})`)
    } else {
      console.log(`  - ファイルなし: ${name}`)
    }
    m.status = 'rejected'
    removed++
  }
}
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1))
console.log(`${series}: ${removed}名を rejected に（再検索で再取得可能）`)
