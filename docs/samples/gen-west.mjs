// 欧米シリーズ生成: 日本語（03-West）+ 英語（03-West-en）+ 中国語（03-West-zh）
// 内容: 支配者系譜 + 12 家族ファイル + 12 官僚ファイル（言語は west-trans/west-memos で翻訳）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { RULERS, SUCC, DYNASTY_CHANGE, PERIODS, OFFICIALS } from './west-data.mjs'
import { NAMES, TITLES, ERAS } from './west-trans.mjs'
import { MEMOS } from './west-memos.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const VARIANTS = [
  { dir: '03-West', lang: 'ja' },
  { dir: '03-West-en', lang: 'en' },
  { dir: '03-West-zh', lang: 'zh' },
]

// 翻訳ヘルパ（欠落は日本語のまま残し、集計して警告）
const missing = { en: { name: 0, title: 0, memo: 0 }, zh: { name: 0, title: 0, memo: 0 } }
const tr = (map, ja, lang, kind) => {
  if (lang === 'ja' || !ja) return ja || ''
  const v = map[ja]?.[lang]
  if (!v) missing[lang][kind]++
  return v ?? ja
}
const trName = (ja, lang) => tr(NAMES, ja, lang, 'name')
const trTitle = (ja, lang) => tr(TITLES, ja, lang, 'title')
const trMemo = (ja, lang) => tr(MEMOS, ja, lang, 'memo')
const trEra = (ja, lang) => tr(ERAS, ja, lang, 'memo')
const gender = (g, lang) => (lang === 'en' ? (g === '女' ? 'female' : 'male') : g)
const refs = (v, lang) => (v || '').split(/[；;]/).map((s) => s.trim()).filter(Boolean).map((s) => trName(s, lang)).join('；')
// RFC4180: カンマ・引用符・改行を含むセルは引用符で囲む（パーサーは対応済み）
const cell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const row = (cells) => cells.map(cell).join(',')

const byName = new Map(RULERS.map((e) => [e[0], e]))
if (byName.size !== RULERS.length) throw new Error('RULERS に名前の重複')
const officialsByName = new Map()
for (const [era, list] of Object.entries(OFFICIALS)) {
  for (const o of list) {
    if (officialsByName.has(o[0])) throw new Error(`OFFICIALS に名前の重複: ${o[0]}`)
    officialsByName.set(o[0], { name: o[0], sex: o[1] || '男', b: o[2] || '', d: o[3] || '', title: o[4], period: '', memo: o[7] || '', era })
  }
}
const periodOf = (n) => byName.get(n)[10]
const fname = (i, era, span, series) =>
  `west-${String(i + 1).padStart(2, '0')}-${era.replace(/・/g, '-')}-${span}-${series}.csv`

for (const { dir, lang } of VARIANTS) {
  const OUT = path.join(DIR, dir)
  fs.mkdirSync(OUT, { recursive: true })

  // ── 1. 支配者系譜 ──
  {
    // ヘッダーはパーサーの別名に合わせ小文字（Name 等の大文字は認識されない）
    const header = lang === 'en'
      ? 'name,gender,birth,death,title,period,succession,custom,note'
      : '名前,性別,生年,没年,肩書,期間,継承,朝代更换,メモ'
    const rows = RULERS.filter((e) => e[8]).map((e) =>
      row([trName(e[0], lang), gender(e[1], lang), e[2], e[3], trTitle(e[7], lang), e[8],
           refs(SUCC[e[0]], lang), refs(DYNASTY_CHANGE[e[0]], lang), trMemo(e[9], lang)]))
    fs.writeFileSync(path.join(OUT, 'west-imperial-succession.csv'), [header, ...rows].join('\n'))
  }

  // ── 2. 家族シリーズ ──
  for (const [i, [era, span]] of PERIODS.entries()) {
    const members = RULERS.filter((e) => periodOf(e[0]) === era)
    const inFile = new Set(members.map((e) => e[0]))
    const injected = []
    for (const e of members) {
      for (const ref of [e[4], e[5], e[6]].flatMap((v) => (v || '').split(/[；;]/).map((s) => s.trim()).filter(Boolean))) {
        if (inFile.has(ref)) continue
        const src = byName.get(ref)
        if (src) injected.push([src[0], src[1], src[2], src[3], '', '', '', src[7], src[8], src[9]])
        else {
          const of = officialsByName.get(ref)
          if (!of) throw new Error(`${era}: 未定義の参照 ${ref}（${e[0]}）`)
          injected.push([of.name, of.sex, of.b, of.d, '', '', '', of.title, of.period, of.memo])
        }
        inFile.add(ref)
      }
    }
    const header = lang === 'en'
      ? 'name,gender,birth,death,father,mother,spouse,title,period,note'
      : '名前,性別,生年,没年,父,母,配偶者,肩書,期間,メモ'
    const rows = [...members, ...injected].map((e) =>
      row([trName(e[0], lang), gender(e[1], lang), e[2], e[3],
           refs(e[4], lang), refs(e[5], lang), refs(e[6], lang),
           trTitle(e[7], lang), e[8], trMemo(e[9], lang)]))
    fs.writeFileSync(path.join(OUT, fname(i, era, span, 'family')), [header, ...rows].join('\n'))
  }

  // ── 3. 官僚シリーズ ──
  for (const [i, [era, span]] of PERIODS.entries()) {
    const offs = OFFICIALS[era]
    const rows = offs.map((o) => ({ name: o[0], sex: o[1] || '男', b: o[2] || '', d: o[3] || '', title: o[4], lord: o[5] || '', period: o[6] || '', memo: o[7] || '', injected: false }))
    const names = new Set(offs.map((o) => o[0]))
    for (const o of offs) {
      for (const lord of (o[5] || '').split(/[；;]/).map((s) => s.trim()).filter(Boolean)) {
        if (names.has(lord)) continue
        const src = byName.get(lord)
        if (!src) throw new Error(`${era}: 未解決の主君 ${lord}（${o[0]}）`)
        rows.push({ name: src[0], sex: src[1], b: src[2], d: src[3], title: src[7], lord: '', period: src[8], memo: `${src[10]}の君主`, injected: true })
        names.add(lord)
      }
    }
    const header = lang === 'en'
      ? 'name,gender,birth,death,title,lord,period,note'
      : '名前,性別,生年,没年,肩書,主君,期間,メモ'
    const memoOf = (o) => {
      if (!o.injected) return trMemo(o.memo, lang)
      const era = o.memo.replace(/の君主$/, '')
      return lang === 'ja' ? o.memo : lang === 'en' ? `${trEra(era, lang)} ruler` : `${trEra(era, lang)}君主`
    }
    const csv = [header, ...rows.map((o) =>
      row([trName(o.name, lang), gender(o.sex, lang), o.b, o.d, trTitle(o.title, lang),
           refs(o.lord, lang), o.period, memoOf(o)]))].join('\n')
    fs.writeFileSync(path.join(OUT, fname(i, era, span, 'officials')), csv)
  }
  console.log(`${dir}: 完了`)
}

for (const lang of ['en', 'zh']) {
  const m = missing[lang]
  console.log(`${lang === 'en' ? '英語' : '中国語'}: 未翻訳 名前${m.name}・肩書${m.title}・メモ${m.memo}`)
}
