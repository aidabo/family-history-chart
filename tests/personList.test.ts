import { describe, it, expect } from 'vitest'
import { buildPersonListRows, personTimeOf, type PersonListOrder } from '../src/lib/components/canvas/PersonListPanel'
import { timelineYearOf, timelineYearLabel } from '../src/lib/utils/familyLayout'

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

describe('timelineYearLabel（行に出す年）', () => {
  const t2 = { birth: '598', death: '649', period: '626-649' }
  it('在位期間モードは在位期間', () => {
    expect(timelineYearLabel(t2, 'period')).toBe('626-649')
  })
  it('生没年モードは生年–没年', () => {
    expect(timelineYearLabel(t2, 'lifespan')).toBe('598–649')
  })
  it('期間が無ければ生没年、片方だけなら ? で埋める', () => {
    expect(timelineYearLabel({ birth: '598' }, 'period')).toBe('598–?')
    expect(timelineYearLabel({ death: '前272' }, 'lifespan')).toBe('?–前272')
    expect(timelineYearLabel({}, 'period')).toBe('')
  })
  it('period が読めない年でも、表示は period の文字列のまま（軸とそろえる）', () => {
    expect(timelineYearLabel({ birth: '598', period: '在位中' }, 'period')).toBe('在位中')
    expect(timelineYearOf({ birth: '598', period: '在位中' }, 'period')).toBeNull()
  })
})

describe('世代の見出し（generation）', () => {
  const people = [
    p('a1', '兄', '1500'), p('a2', '弟', '1510'),   // 同じ世代（2人）→ 見出しあり
    p('b1', '甥', '1540'),                          // 1人だけの世代 → 見出しなし
    p('c1', '孫'), p('c2', '孫2'),                   // 世代不明（2人）→ その他の見出し
  ]
  const rowsOf = (rowOf: (id: string) => number | null) =>
    buildPersonListRows(people, '', rowOf, undefined, 'generation', t).rows

  it('1人の世代には見出しを出さない', () => {
    const rows = rowsOf(id => (id === 'b1' ? 2 : id.startsWith('a') ? 0 : null))
    const labels = rows.filter(r => r.kind === 'group').map(r => (r as any).label)
    expect(labels).toEqual(['Generation 1 (2)', 'Others (2)'])
    const names = rows.filter(r => r.kind === 'person').map(r => (r as any).p.name)
    expect(names).toEqual(['兄', '弟', '甥', '孫', '孫2'])
  })
  it('どの世代も1人なら見出しは出ない', () => {
    const rows = rowsOf(id => ({ a1: 0, a2: 1, b1: 2, c1: 3, c2: 4 } as Record<string, number>)[id] ?? null)
    expect(rows.every(r => r.kind === 'person')).toBe(true)
  })
})
