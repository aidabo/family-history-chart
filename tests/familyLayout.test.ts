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

  it('多婚の段＋大きなカードでは、ずれぶんの高さが確保される', () => {
    // a → p、p は2回結婚（s1/s2）、それぞれに子（c1/c2）
    const nodes = [
      { id: 'a', name: 'A' },
      { id: 'p', name: 'P' },
      { id: 's1', name: 'S1' },
      { id: 's2', name: 'S2' },
      { id: 'u1', name: 'U1', type: 'union' },
      { id: 'u2', name: 'U2', type: 'union' },
      { id: 'c1', name: 'C1' },
      { id: 'c2', name: 'C2' },
    ]
    const links = [
      { source: 'a', target: 'p', type: 'parent-child' },
      { source: 'p', target: 'u1', type: 'partner' },
      { source: 's1', target: 'u1', type: 'partner' },
      { source: 'p', target: 'u2', type: 'partner' },
      { source: 's2', target: 'u2', type: 'partner' },
      { source: 'u1', target: 'c1', type: 'parent-child' },
      { source: 'u2', target: 'c2', type: 'parent-child' },
    ]
    const radius = { a: 120, p: 120, s1: 120, s2: 120, u1: 12, u2: 12, c1: 120, c2: 120 }
    const p = computeFamilyLayout(nodes, links, { mode: 'tidy', nodeRadius: radius }).positions
    const VST = 160 * 0.34
    // p の段（s1/s2 を含む）と子の段の差は、半径ぶん＋ずれ1段ぶん以上
    const gapToKids = Math.min(pos(p, 'c1').y, pos(p, 'c2').y) - pos(p, 'p').y
    expect(gapToKids).toBeGreaterThanOrEqual(120 + 120 + 80 + VST - 0.01)
  })
})
