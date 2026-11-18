import { describe, it, expect } from 'vitest'
import { buildPersonListRows, personTimeOf, type PersonListOrder } from '../src/lib/components/canvas/PersonListPanel'
import { timelineYearOf } from '../src/lib/utils/familyLayout'

const t = (en: string) => en
const p = (id: string, name: string, birth?: string, death?: string, period?: string) =>
  ({ id, name, birth, death, period }) as any
const names = (people: any[], order: PersonListOrder, query = '', timeOf?: (x: any) => number | null) =>
  buildPersonListRows(people, query, () => null, undefined, order, t, timeOf).rows
    .map(r => (r.kind === 'person' ? r.p.name : r.label))

// 年表の軸と同じ基準（在位期間モード）で並べるときの関数 — canvas と同じもの。
const periodTimeOf = (x: any) => timelineYearOf(x, 'period')

describe('personTimeOf（人物の時間）', () => {
  it('生年があれば生年', () => {
    expect(personTimeOf(p('a', 'A', '1153', '1213'))).toBe(1153)
  })
  it('生年が無ければ没年を使う', () => {
    expect(personTimeOf(p('b', 'B', undefined, '前272'))).toBe(-272)
    expect(personTimeOf(p('c', 'C', '?', '1650'))).toBe(1650)
  })
  it('どちらも無ければ null', () => {
    expect(personTimeOf(p('d', 'D'))).toBeNull()
  })
})

describe('buildPersonListRows', () => {
  const people = [
    p('x', '趙', '1600', '1660'),
    p('y', '錢', undefined, '1550'),   // 生年なし → 没年 1550
    p('z', '孫', '1500', '1590'),
    p('w', '李'),                       // 年なし → 最後
    p('v', '周', '1500', '1580'),       // 孫と同じ生年 → 名前順
    p('u', '呉'),                       // 年なし（2人目）→ 名前順で 李 のあと
  ]

  it('年表（time）は生年→（無ければ）没年の順、年なしは最後', () => {
    expect(names(people, 'time')).toEqual(['周', '孫', '錢', '趙', '呉', '李'])
  })
  it('名前順（name）は従来どおり', () => {
    expect(names(people, 'name')).toEqual(['呉', '周', '孫', '李', '趙', '錢'])
  })
  it('検索で絞っても年順', () => {
    expect(names(people, 'time', '錢')).toEqual(['錢'])
    const subset = [people[0], people[1], people[2]]
    expect(names(subset, 'time', '')).toEqual(['孫', '錢', '趙'])
  })
  it('在位期間が基準なら period の開始年で並ぶ', () => {
    const withPeriods = [
      p('p1', '甲', '1500', '1580', '1550-1570'),   // 生年1500 だが在位は1550
      p('p2', '乙', '1520', '1600'),                 // period なし → 生年1520
      p('p3', '丙', '1530', undefined, '1540-1560'), // 生年1530 だが在位は1540
    ]
    // 生没年基準: 甲(1500) → 乙(1520) → 丙(1530)
    expect(names(withPeriods, 'time')).toEqual(['甲', '乙', '丙'])
    // 在位期間基準: 乙(1520) → 丙(1540) → 甲(1550)（甲と丙が入れ替わる）
    expect(names(withPeriods, 'time', '', periodTimeOf)).toEqual(['乙', '丙', '甲'])
  })
})

describe('timelineYearOf（軸と同じ年）', () => {
  const who = { birth: '1500', death: '1580', period: '1550-1570' }
  it('生没年モードは生年→没年', () => {
    expect(timelineYearOf(who, 'lifespan')).toBe(1500)
    expect(timelineYearOf({ death: '前272' }, 'lifespan')).toBe(-272)
  })
  it('在位期間モードは period の開始→終了（period が無ければ生没年）', () => {
    expect(timelineYearOf(who, 'period')).toBe(1550)
    expect(timelineYearOf({ birth: '1500', death: '1580' }, 'period')).toBe(1500)
    expect(timelineYearOf({ death: '前272' }, 'period')).toBe(-272)
  })
  it('年が無ければ null', () => {
    expect(timelineYearOf({}, 'period')).toBeNull()
  })
})
