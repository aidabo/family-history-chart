import { describe, it, expect } from 'vitest'
import { computeFamilyLayout, computeRowY } from '../src/lib/utils/familyLayout'

// A simple three-generation line: A → B → C.
const chain = () => ({
  nodes: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
  ],
  links: [
    { source: 'a', target: 'b', type: 'parent-child' },
    { source: 'b', target: 'c', type: 'parent-child' },
  ],
})
const pos = (p: Record<string, { x: number; y: number }>, id: string) => p[id]

describe('computeRowY (系図の段の高さ)', () => {
  it('既定の大きさ（半径40）どうしは rowGap のまま', () => {
    const y = computeRowY([{ gen: 0, maxR: 40 }, { gen: 1, maxR: 40 }, { gen: 2, maxR: 40 }], { topY: 100, rowGap: 160 })
    expect(y.get(0)).toBe(100)
    expect(y.get(1)).toBe(260)
    expect(y.get(2)).toBe(420)
  })

  it('大きなカードがある段だけ r1 + r2 + 80 に広がる', () => {
    const y = computeRowY([{ gen: 0, maxR: 40 }, { gen: 1, maxR: 120 }, { gen: 2, maxR: 40 }], { topY: 100, rowGap: 160 })
    expect(y.get(1)).toBe(100 + (40 + 120 + 80))       // 340
    expect(y.get(2)).toBe(340 + (120 + 40 + 80))       // 580
  })

  it('人のいない世代は rowGap ずつ進める', () => {
    const y = computeRowY([{ gen: 0, maxR: 40 }, { gen: 2, maxR: 40 }], { topY: 100, rowGap: 160 })
    expect(y.get(0)).toBe(100)
    expect(y.get(2)).toBe(100 + 160 + 160)             // 空きの段1つ＋段の間隔
  })

  it('結婚3本の段は ±VST ぶんを確保する（(n-1)/2）', () => {
    const y = computeRowY(
      [{ gen: 0, maxR: 40 }, { gen: 1, maxR: 120, stagger: 54.4 }, { gen: 2, maxR: 40 }],
      { topY: 100, rowGap: 160 },
    )
    expect(y.get(1)).toBeCloseTo(100 + (40 + 120 + 80) + 54.4, 5)
  })

  it('再婚のずれ（stagger）は、段を広げるときだけ足す', () => {
    const withBig = computeRowY(
      [{ gen: 0, maxR: 40 }, { gen: 1, maxR: 120, stagger: 54 }, { gen: 2, maxR: 40 }],
      { topY: 100, rowGap: 160 },
    )
    expect(withBig.get(1)).toBe(100 + (40 + 120 + 80) + 54)
    expect(withBig.get(2)).toBe(withBig.get(1)! + (120 + 40 + 80) + 54)

    // 既定の大きさの図は、再婚があっても今までどおり（ずれは段の間隔に足さない）。
    const small = computeRowY(
      [{ gen: 0, maxR: 40 }, { gen: 1, maxR: 40, stagger: 54 }, { gen: 2, maxR: 40 }],
      { topY: 100, rowGap: 160 },
    )
    expect(small.get(1)).toBe(260)
    expect(small.get(2)).toBe(420)
  })
})

describe('computeFamilyLayout (tidy)', () => {
  it('既定の大きさなら、これまでどおり topY + 世代×rowGap', () => {
    const { nodes, links } = chain()
    const radius = Object.fromEntries(nodes.map(n => [n.id, 40]))
    const p = computeFamilyLayout(nodes, links, { mode: 'tidy', nodeRadius: radius }).positions
    expect(pos(p, 'a').y).toBe(100)
    expect(pos(p, 'b').y).toBe(260)
    expect(pos(p, 'c').y).toBe(420)
  })

  it('大きなカードの段の間隔が広がり、親子の線に縦のすき間ができる', () => {
    const { nodes, links } = chain()
    const radius = { a: 40, b: 120, c: 40 }
    const p = computeFamilyLayout(nodes, links, { mode: 'tidy', nodeRadius: radius }).positions
    expect(pos(p, 'b').y).toBe(340)
    expect(pos(p, 'c').y).toBe(580)
    // バスが引ける条件: 下の箱の上端が上の箱の下端より 4px 以上下にある
    for (const [up, lo] of [['a', 'b'], ['b', 'c']] as const) {
      const upper = pos(p, up), lower = pos(p, lo)
      expect(lower.y - radius[lo]).toBeGreaterThan(upper.y + radius[up] + 4)
    }
  })

  it('多婚の段＋大きなカード: 実際にずらした配偶者と子の間にすき間が残る', () => {
    // 子どうしが結婚して2つの結婚の子の範囲が重なる形（crisscross）。このとき
    // 設計上、配偶者は ±VST/2 ずらされる。
    const kids1 = ['a', 'b', 'c'], kids2 = ['d', 'e', 'f']
    const nodes = [
      { id: 'p', name: 'P' }, { id: 's1', name: 'S1' }, { id: 's2', name: 'S2' },
      { id: 'u1', name: 'U1', type: 'union' }, { id: 'u2', name: 'U2', type: 'union' },
      ...[...kids1, ...kids2].map(k => ({ id: k, name: k.toUpperCase() })),
      { id: 'm1', name: 'M1', type: 'union' }, { id: 'm2', name: 'M2', type: 'union' }, { id: 'm3', name: 'M3', type: 'union' },
    ]
    const links = [
      { source: 'p', target: 'u1', type: 'partner' }, { source: 's1', target: 'u1', type: 'partner' },
      { source: 'p', target: 'u2', type: 'partner' }, { source: 's2', target: 'u2', type: 'partner' },
      ...kids1.map(k => ({ source: 'u1', target: k, type: 'parent-child' })),
      ...kids2.map(k => ({ source: 'u2', target: k, type: 'parent-child' })),
      { source: 'a', target: 'm1', type: 'partner' }, { source: 'e', target: 'm1', type: 'partner' },
      { source: 'b', target: 'm2', type: 'partner' }, { source: 'd', target: 'm2', type: 'partner' },
      { source: 'c', target: 'm3', type: 'partner' }, { source: 'f', target: 'm3', type: 'partner' },
    ]
    const R = 120, VST = 160 * 0.34
    const radius = Object.fromEntries(nodes.map(n => [n.id, n.type === 'union' ? 12 : R]))
    const p = computeFamilyLayout(nodes, links, { mode: 'tidy', nodeRadius: radius }).positions
    // 1) 実際に互い違いになっている（s1 と s2 の y が VST/2 ずつ違う）
    expect(Math.abs(p.s1.y - p.s2.y)).toBeCloseTo(VST, 0)
    // 2) ずらした配偶者の下端と子の上端の間にすき間がある
    for (const sp of ['s1', 's2']) {
      for (const k of [...kids1, ...kids2]) {
        expect(p[k].y - R - (p[sp].y + R)).toBeGreaterThanOrEqual(0)
      }
    }
    // 3) 段の間隔は 半径ぶん＋ずれの確保ぶん（n=2 → VST/2）
    expect(p.a.y - p.p.y).toBeGreaterThanOrEqual(2 * R + 80 + VST / 2 - 0.01)
  })
})
