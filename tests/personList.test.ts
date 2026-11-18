import { describe, it, expect } from 'vitest'
import { buildPersonListRows, personTimeOf } from '../src/lib/components/canvas/PersonListPanel'

const t = (en: string) => en
const p = (id: string, name: string, birth?: string, death?: string) =>
  ({ id, name, birth, death }) as any

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

describe('buildPersonListRows（年表の並び）', () => {
  const people = [
    p('x', '趙', '1600', '1660'),
    p('y', '錢', undefined, '1550'),   // 生年なし → 没年 1550
    p('z', '孫', '1500', '1590'),
    p('w', '李'),                       // 年なし → 最後
    p('v', '周', '1500', '1580'),       // 孫と同じ生年 → 名前順
  ]
  const rows = (sortByTime: boolean) =>
    buildPersonListRows(people, '', () => null, undefined, false, t, sortByTime).rows
      .map(r => (r.kind === 'person' ? r.p.name : r.label))

  it('年表では生年→（無ければ）没年の順、年なしは最後', () => {
    expect(rows(true)).toEqual(['周', '孫', '錢', '趙', '李'])
  })
  it('名前順のときは従来どおり（localeCompare）', () => {
    expect(rows(false)).toEqual(['周', '孫', '李', '趙', '錢'])
  })
})
