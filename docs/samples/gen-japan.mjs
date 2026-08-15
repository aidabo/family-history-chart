// 日本シリーズ生成: japan-imperial-succession.csv + 10 家族ファイル + 10 官僚ファイル
//  - 天皇系譜: 継承列（重祚・南北朝・摂政含む）
//  - 家族: 時代別に分割、他時代の父/母/配偶者は master から行として自動注入
//  - 官僚: 主君列（天皇は master から自動注入、同ファイルの官僚も可）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { EMPERORS, SUCC, PERIODS, OFFICIALS } from './japan-data.mjs'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(DIR, '02-Japan')

const byName = new Map(EMPERORS.map((e) => [e[0], e]))
if (byName.size !== EMPERORS.length) throw new Error('EMPERORS に名前の重複')

// 官僚も参照解決の対象に含める（皇后・妃の父など）
const officialsByName = new Map()
for (const [era, list] of Object.entries(OFFICIALS)) {
  for (const o of list) {
    if (officialsByName.has(o[0])) throw new Error(`OFFICIALS に名前の重複: ${o[0]}`)
    officialsByName.set(o[0], { name: o[0], sex: o[1] || '男', b: o[2] || '', d: o[3] || '', title: o[4], period: '', memo: o[7] || '', era })
  }
}

const periodOf = (n) => byName.get(n)[10]

const fname = (i, era, span, series) =>
  `japan-${String(i + 1).padStart(2, '0')}-${era.replace(/・/g, '-')}-${span}-${series}.csv`

// ── 1. 天皇系譜（期間が空欄の皇后・妃は含めない）────────────
{
  const rows = EMPERORS.filter((e) => /天皇|摂政/.test(e[7]) && e[8])
  const rowNames = new Set(rows.map((e) => e[0]))
  const missing = rows.filter((e) => !(e[0] in SUCC))
  if (missing.length) throw new Error(`SUCC に無い天皇: ${missing.map((e) => e[0]).join(',')}`)
  const unused = Object.keys(SUCC).filter((k) => !rowNames.has(k))
  if (unused.length) throw new Error(`SUCC の余剰キー（行が無い）: ${unused.join(',')}`)
  const csv = [
    '名前,性別,生年,没年,肩書,期間,継承,メモ',
    ...rows.map((e) => [e[0], e[1], e[2], e[3], e[7], e[8], SUCC[e[0]] || '', e[9]].join(',')),
  ].join('\n')
  fs.writeFileSync(path.join(OUT, 'japan-imperial-succession.csv'), csv)
  console.log(`japan-imperial-succession.csv: ${rows.length} 天皇（継承 ${Object.keys(SUCC).length}）`)
}

// ── 2. 家族シリーズ（時代別） ────────────────────────────
for (const [i, [era, span]] of PERIODS.entries()) {
  const members = EMPERORS.filter((e) => periodOf(e[0]) === era)
  const inFile = new Set(members.map((e) => e[0]))

  // 参照（父/母/配偶者）のうち他時代のもの → 天皇/官僚 master から注入
  const injected = []
  for (const e of members) {
    for (const ref of [e[4], e[5], e[6]].flatMap((v) => (v || '').split(/[；;]/).map((s) => s.trim()).filter(Boolean))) {
      if (inFile.has(ref)) continue
      const src = byName.get(ref)
      if (src) {
        // 注入行は参照（父/母/配偶者）を空にして出力（自分の参照を引きずらない）
        injected.push([src[0], src[1], src[2], src[3], '', '', '', src[7], src[8], src[9]])
      } else {
        const of = officialsByName.get(ref)
        if (!of) throw new Error(`${era}: 未定義の参照 ${ref}（${e[0]}）`)
        injected.push([of.name, of.sex, of.b, of.d, '', '', '', of.title, of.period, of.memo])
      }
      inFile.add(ref)
    }
  }
  const header = '名前,性別,生年,没年,父,母,配偶者,肩書,期間,メモ'
  const rows = [...members, ...injected].map((e) =>
    [e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8], e[9]].join(','))
  fs.writeFileSync(path.join(OUT, fname(i, era, span, 'family')), [header, ...rows].join('\n'))
  console.log(`${fname(i, era, span, 'family')}: ${members.length}人（他時代注入 ${injected.length}）`)
}

// ── 3. 官僚シリーズ（時代別） ────────────────────────────
for (const [i, [era, span]] of PERIODS.entries()) {
  const offs = OFFICIALS[era]
  if (!offs) throw new Error(`OFFICIALS に ${era} が無い`)
  const rows = offs.map((o) => [o[0], o[1] || '男', o[2] || '', o[3] || '', o[4], o[5] || '', o[6] || '', o[7] || ''])
  const names = new Set(offs.map((o) => o[0]))
  if (names.size !== offs.length) throw new Error(`${era}: 官僚名の重複`)

  // 主君参照の解決: 同ファイルの官僚 → master の天皇 → それ以外はエラー
  const injected = []
  for (const o of offs) {
    for (const lord of (o[5] || '').split(/[；;]/).map((s) => s.trim()).filter(Boolean)) {
      if (names.has(lord)) continue
      const src = byName.get(lord)
      if (!src) throw new Error(`${era}: 未解決の主君 ${lord}（${o[0]}）`)
      if (!names.has(lord)) {
        rows.push([src[0], src[1], src[2], src[3], src[7], '', src[8], `${src[10]}の君主`])
        names.add(lord)
        injected.push(lord)
      }
    }
  }
  const header = '名前,性別,生年,没年,肩書,主君,期間,メモ'
  const csv = [header, ...rows].join('\n')
  fs.writeFileSync(path.join(OUT, fname(i, era, span, 'officials')), csv)
  console.log(`${fname(i, era, span, 'officials')}: 官僚${offs.length}（君主注入 ${injected.length}）`)
}

console.log('\nOK: 日本シリーズ生成完了 →', OUT)
