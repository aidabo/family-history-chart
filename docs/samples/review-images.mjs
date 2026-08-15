// review-images.mjs — 取得画像の点検用コンタクトシート生成
// 機械的ヒューリスティック（名前と画像タイトルの共通文字）で怪しい画像をフラグし、
// 名前・出典タイトル・ライセンス・出典リンク付きの HTML グリッドを出力する。
// 生成先: /tmp/review-{series}.html（ブラウザで開いて目視点検する）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { NAMES as WEST_NAMES } from './west-trans.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
// HTML エスケープ（コンタクトシートの動的値を安全に埋め込む）
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]))
const IMG = path.join(DIR, 'images')
const series = process.argv[2] || '03-West'
// パストラバーサル対策: series はホワイトリストのみ許可
const ALLOWED_SERIES = ['01-China', '02-Japan', '03-West']
if (!ALLOWED_SERIES.includes(series)) {
  console.error(`不正な series: ${series}（許可: ${ALLOWED_SERIES.join(' / ')}）`)
  process.exit(1)
}
const onlyFile = process.argv[3] // オプション: 指定名のみ表示（改行区切りのファイル）

const man = JSON.parse(fs.readFileSync(path.join(IMG, series, 'manifest.json'), 'utf8'))
let done = man.filter((m) => m.status === 'done')
if (onlyFile) {
  const only = new Set(fs.readFileSync(onlyFile, 'utf8').trim().split(/\n/).filter(Boolean))
  done = done.filter((m) => only.has(m.name))
}

const enMap = series === '03-West' ? WEST_NAMES : null
const cjkChars = (s) => [...new Set((s || '').replace(/[^一-鿿぀-ヿ]/g, ''))]

// ヒューリスティック: タイトルに名前のCJK文字が1字もなく、英語名も含まれない → フラグ
const flagged = []
for (const m of done) {
  const title = m.title || ''
  const shared = cjkChars(m.name).filter((c) => title.includes(c)).length
  const en = enMap?.[m.name]?.en
  const enHit = en ? title.toLowerCase().includes(en.toLowerCase()) : false
  if (shared === 0 && !enHit) flagged.push(m)
}

const cells = done.map((m) => {
  const isFlag = flagged.includes(m)
  const exists = fs.existsSync(path.join(IMG, series, m.file)) ? '' : '<div class="no">ファイルなし!</div>'
  return `<div class="cell${isFlag ? ' flag' : ''}">
    <img src="${esc(m.file)}" loading="lazy" onerror="this.closest('.cell').classList.add('broken')">
    <div class="n">${esc(m.name)}</div>
    <div class="t">${esc(m.title)}</div>
    <div class="l">${esc(m.license)}${isFlag ? ' ⚠フラグ' : ''}</div>
    <a href="${esc(m.descriptionurl)}" target="_blank">出典</a>${exists}
  </div>`
}).join('\n')

const html = `<!doctype html><meta charset="utf-8"><title>review ${series}</title>
<style>
  body { font-family: sans-serif; margin: 12px; background: #222; color: #eee; }
  h1 { font-size: 16px; }
  .grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; }
  .cell { border: 1px solid #555; border-radius: 6px; padding: 6px; background: #333; overflow: hidden; }
  .cell.flag { border: 3px solid #f66; }
  .cell.broken { background: #500; }
  .cell img { width: 100%; height: 110px; object-fit: cover; display: block; background: #000; }
  .n { font-weight: bold; font-size: 12px; margin-top: 4px; word-break: break-all; }
  .t { font-size: 10px; color: #9cf; word-break: break-all; max-height: 32px; overflow: hidden; }
  .l { font-size: 10px; color: #aaa; }
  a { font-size: 10px; color: #7f7; }
  .no { color: #f66; font-weight: bold; }
</style>
<h1>${series}: ${done.length}枚（フラグ ${flagged.length}）</h1>
<div class="grid">${cells}</div>`

fs.writeFileSync(path.join(IMG, series, 'review.html'), html)
// 目視用に分割チャンクも生成（フルページスクリーンショット1枚が収まるサイズ）
const CHUNK = 64
for (let c = 0; c < done.length; c += CHUNK) {
  const cells = done.slice(c, c + CHUNK).map((m) => {
    const isFlag = flagged.includes(m)
    const exists = fs.existsSync(path.join(IMG, series, m.file)) ? '' : '<div class="no">ファイルなし!</div>'
    return `<div class="cell${isFlag ? ' flag' : ''}">
      <img src="${esc(m.file)}" loading="lazy" onerror="this.closest('.cell').classList.add('broken')">
      <div class="n">${esc(m.name)}</div>
      <div class="t">${esc(m.title)}</div>
      <div class="l">${esc(m.license)}${isFlag ? ' ⚠フラグ' : ''}</div>
      <a href="${esc(m.descriptionurl)}" target="_blank">出典</a>${exists}
    </div>`
  }).join('\n')
  const h = `<!doctype html><meta charset="utf-8"><title>review ${series} #${c / CHUNK + 1}</title>
  <style>
    body { font-family: sans-serif; margin: 12px; background: #222; color: #eee; }
    .grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; }
    .cell { border: 1px solid #555; border-radius: 6px; padding: 6px; background: #333; overflow: hidden; }
    .cell.flag { border: 3px solid #f66; }
    .cell.broken { background: #500; }
    .cell img { width: 100%; height: 150px; object-fit: cover; display: block; background: #000; }
    .n { font-weight: bold; font-size: 13px; margin-top: 4px; word-break: break-all; }
    .t { font-size: 11px; color: #9cf; word-break: break-all; max-height: 34px; overflow: hidden; }
    .l { font-size: 11px; color: #aaa; }
    a { font-size: 11px; color: #7f7; }
    .no { color: #f66; font-weight: bold; }
  </style>
  <div class="grid">${cells}</div>`
  fs.writeFileSync(path.join(IMG, series, `review-${c / CHUNK + 1}.html`), h)
}
console.log(`${series}: ${done.length}枚 / フラグ${flagged.length} / review.html（images/${series}/）`)
if (flagged.length) console.log('フラグ対象:', flagged.map((m) => `${m.name} ← ${m.title}`).join('\n  '))
