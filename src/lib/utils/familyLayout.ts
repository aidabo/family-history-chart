// Smart genealogy auto-layout.
//
// Two layout strategies share the same horizontal "family grouping" pass so a
// chart never turns into a hairball:
//
//   • tidy      — a Reingold–Tilford-style descendant tree. Vertical axis = generation
//                 (parent above child, disciple/adoption below master/parent); horizontal
//                 axis packs sibling subtrees left→right with spouses flanking their union.
//   • timeline  — same horizontal family grouping, but the vertical axis is real time
//                 (y ∝ birth year, older = higher). Years missing on a node are inferred
//                 from parents/children/spouses.
//
// `mode: 'auto'` picks timeline when enough people have a parseable birth year,
// otherwise tidy.
//
// Unions (type:'union') are treated as the marriage anchor: the two partners sit on
// either side of the union marker in the same row, and their children hang centered
// below it. Adoption ('養子' label) and step ('義理' label) parent-child edges, plus
// disciple/master edges, count as vertical (generation) edges too.

export interface LayoutNode {
  id: string
  type?: string
  gender?: string
  birth?: string
  death?: string
  name?: string
}

export interface LayoutLink {
  source: string
  target: string
  type?: string
  label?: string
}

export type LayoutMode = 'auto' | 'tidy' | 'timeline' | 'force'

export interface LayoutOptions {
  mode?: LayoutMode
  centerX?: number   // x the whole drawing is centered on
  topY?: number      // y of the first (oldest) generation
  colGap?: number    // horizontal distance between adjacent people
  rowGap?: number    // vertical distance between generations
  timelineCols?: number  // timeline: max columns a chain-like line snakes across (width control)
}

// A component is "chain-like" when almost nothing branches — a linear succession/temporal
// line (e.g. an emperor lineage) rather than a family tree. Such a component is snaked
// left↔right within a bounded width instead of drifting endlessly to one side.
function isChainLike(nodes: LayoutNode[], links: LayoutLink[]): boolean {
  if (nodes.length < 8) return false
  const deg = new Map<string, number>()
  for (const l of links) {
    deg.set(l.source, (deg.get(l.source) ?? 0) + 1)
    deg.set(l.target, (deg.get(l.target) ?? 0) + 1)
  }
  const branchy = nodes.filter(n => (deg.get(n.id) ?? 0) > 2).length
  return branchy <= nodes.length * 0.15
}

// Order the ids by a depth-first walk of the chain edges, starting from the earliest node
// and, at each step, continuing to the UNVISITED neighbour whose year is closest. This keeps
// each lineage contiguous, so when snaked into columns the succession edges connect adjacent
// columns (short, non-crossing); only a genuine branch/dynasty-change becomes a long jump.
function chainOrder(ids: string[], links: LayoutLink[], yearOf: (id: string) => number | undefined): string[] {
  const idset = new Set(ids)
  const adj = new Map<string, string[]>()
  for (const id of ids) adj.set(id, [])
  for (const l of links) {
    if (idset.has(l.source) && idset.has(l.target)) {
      adj.get(l.source)!.push(l.target)
      adj.get(l.target)!.push(l.source)
    }
  }
  const y = (id: string) => yearOf(id) ?? Number.MAX_SAFE_INTEGER
  const starts = [...ids].sort((a, b) => y(a) - y(b))
  const visited = new Set<string>()
  const order: string[] = []
  for (const s of starts) {
    if (visited.has(s)) continue
    const stack = [s]
    while (stack.length) {
      const id = stack.pop()!
      if (visited.has(id)) continue
      visited.add(id); order.push(id)
      // Closest-year unvisited neighbour should be visited next → push it LAST (popped first).
      const nbs = adj.get(id)!.filter(n => !visited.has(n))
        .sort((a, b) => Math.abs(y(a) - y(id)) - Math.abs(y(b) - y(id)))
      for (let i = nbs.length - 1; i >= 0; i--) stack.push(nbs[i])
    }
  }
  return order
}

export interface LayoutResult {
  positions: Record<string, { x: number; y: number }>
  mode: 'tidy' | 'timeline'
}

// Modern Japanese eras (元号) with an unambiguous, fixed Gregorian start year. Older
// Japanese eras and Chinese dynasty eras are intentionally NOT included — there are
// hundreds/thousands and they overlap across dynasties, so they can't be resolved
// reliably from an era name alone.
const JP_ERAS: Array<[string, number]> = [
  ['令和', 2019], ['平成', 1989], ['昭和', 1926], ['大正', 1912], ['明治', 1868],
]

// Extract a signed integer year from strings like "1543", "1543-06-23", "155"; a BC year
// ("-200", "前200", "紀元前200", "公元前200(年)", "200 BC"/"200 BCE") → negative; AD/CE
// forms ("公元100", "西暦1600") stay positive; or a modern Japanese era ("明治3年",
// "昭和10", "令和元年") → Gregorian. Other era names (享保12 等) return the bare number.
// Century notation ("12世紀", "12世纪", "12th century", "前13世紀") → the century's MIDPOINT
// year ((N-1)*100 + 50), signed for BC — e.g. 12世紀 → 1150, 前13世紀 → -1250. This keeps
// coarse "Nth-century" datings ordered correctly on the timeline. "约"/"約" (approx.) is ignored.
export function parseYear(s?: string): number | null {
  if (!s) return null
  const str = String(s)
  // Modern Japanese era: era name + (元 | number) → Gregorian (era start + n - 1).
  for (const [era, start] of JP_ERAS) {
    if (!str.includes(era)) continue
    const em = str.match(new RegExp(era + '\\s*(元|\\d{1,3})'))
    const n = em ? (em[1] === '元' ? 1 : parseInt(em[1], 10)) : 1
    return start + n - 1
  }
  // Century notation: intercept before the plain-number match so "12世紀" ≠ year 12.
  if (/(世紀|世纪|century|centuries)/i.test(str)) {
    const cm = str.match(/\d{1,2}/)
    if (cm) {
      let year = (parseInt(cm[0], 10) - 1) * 100 + 50   // midpoint of the century
      if (/(紀元前|前|B\.?C\.?E?)/i.test(str)) year = -year
      return year
    }
  }
  const m = str.match(/-?\d{1,4}/)
  if (!m) return null
  let n = parseInt(m[0], 10)
  if (!Number.isFinite(n)) return null
  if (n > 0 && /(紀元前|前|B\.?C\.?E?)/i.test(str)) n = -n   // BC → negative
  return n
}

// Format a year for display: negative → "前200" (BC).
export function formatYear(n: number): string {
  return n < 0 ? `前${-n}` : String(n)
}

// A 在位/期間 string like "626-649", "前221-前210", "明治1-明治45", or a single "626".
// Return the START / END portion as a string (parseYear handles BC/和暦). Split on a range
// separator; BC uses a "前" prefix so the ASCII "-" between the two years is unambiguous.
export function periodStart(period?: string): string | undefined {
  if (!period) return undefined
  const s = period.trim(); if (!s) return undefined
  return (s.split(/[-–—~〜]/)[0] || '').trim() || undefined
}
export function periodEnd(period?: string): string | undefined {
  if (!period) return undefined
  const parts = period.trim().split(/[-–—~〜]/)
  return (parts[1] ?? parts[0] ?? '').trim() || undefined
}

const isUnion = (n: LayoutNode) => n.type === 'union'

// Vertical (generation) edges: parent-child (incl. 養子/義理) and disciple/master.
const isVerticalEdge = (t?: string) =>
  t === 'parent-child' || t === 'disciple' || t === 'master'

interface Graph {
  nodeMap: Map<string, LayoutNode>
  persons: LayoutNode[]
  partnersOfUnion: Map<string, string[]>   // union id → partner person ids
  childrenOfUnion: Map<string, string[]>   // union id → child ids
  unionsOfPerson: Map<string, string[]>    // person id → union ids they partner in
  directChildren: Map<string, string[]>    // person id → child ids (single parent, no union)
  effParents: Map<string, Set<string>>     // person id → effective parent person ids
  effChildren: Map<string, Set<string>>    // person id → effective child person ids
  // Drawn inter-layer edges (for crossing minimization): the actual lines on screen.
  drawParents: Map<string, string[]>       // child id → immediate drawn parents (union or person)
  drawChildrenNext: Map<string, string[]>  // node id → its children one layer below
}

function buildGraph(nodes: LayoutNode[], links: LayoutLink[]): Graph {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const persons = nodes.filter(n => !isUnion(n))

  const partnersOfUnion = new Map<string, string[]>()
  const childrenOfUnion = new Map<string, string[]>()
  const unionsOfPerson = new Map<string, string[]>()
  const directChildren = new Map<string, string[]>()
  const effParents = new Map<string, Set<string>>()
  const effChildren = new Map<string, Set<string>>()

  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const a = m.get(k); if (a) a.push(v); else m.set(k, [v])
  }
  const addEff = (parent: string, child: string) => {
    if (parent === child) return
    if (!effChildren.has(parent)) effChildren.set(parent, new Set())
    if (!effParents.has(child)) effParents.set(child, new Set())
    effChildren.get(parent)!.add(child)
    effParents.get(child)!.add(parent)
  }

  for (const l of links) {
    const s = nodeMap.get(l.source), t = nodeMap.get(l.target)
    if (!s || !t) continue
    if (l.type === 'partner') {
      // person → union
      if (isUnion(t)) { push(partnersOfUnion, t.id, s.id); push(unionsOfPerson, s.id, t.id) }
      else if (isUnion(s)) { push(partnersOfUnion, s.id, t.id); push(unionsOfPerson, t.id, s.id) }
    } else if (l.type === 'parent-child') {
      if (isUnion(s)) push(childrenOfUnion, s.id, t.id)          // union → child
      else push(directChildren, s.id, t.id)                      // person → child
    }
  }

  // Effective parent/child over persons (union collapsed): partners of a union are
  // the effective parents of that union's children; direct parent-child too.
  for (const [uid, kids] of childrenOfUnion) {
    const parents = partnersOfUnion.get(uid) || []
    for (const k of kids) for (const p of parents) addEff(p, k)
  }
  for (const [p, kids] of directChildren) for (const k of kids) addEff(p, k)
  // disciple/master → vertical (source above target).
  for (const l of links) {
    if (l.type === 'disciple' || l.type === 'master') {
      const s = nodeMap.get(l.source), t = nodeMap.get(l.target)
      if (s && t && !isUnion(s) && !isUnion(t)) addEff(s.id, t.id)
    }
  }

  // Drawn inter-layer edges: union→child and person→child (single parent).
  const drawParents = new Map<string, string[]>()
  const drawChildrenNext = new Map<string, string[]>()
  for (const [uid, kids] of childrenOfUnion) {
    drawChildrenNext.set(uid, [...kids])
    for (const k of kids) push(drawParents, k, uid)
  }
  for (const [pid, kids] of directChildren) {
    const prev = drawChildrenNext.get(pid) || []
    drawChildrenNext.set(pid, prev.concat(kids))
    for (const k of kids) push(drawParents, k, pid)
  }

  return { nodeMap, persons, partnersOfUnion, childrenOfUnion, unionsOfPerson, directChildren, effParents, effChildren, drawParents, drawChildrenNext }
}

// Generation (row) per person via longest path from roots — a node sits strictly
// below every one of its parents — then a fixpoint pass that (a) aligns spouses to
// the same (deeper) generation so a married-in partner with no ancestry drops into
// their partner's row, and (b) re-pushes children below their (now deeper) parents.
// Cycle-safe (visited guard + memo + iteration cap).
function assignGenerations(g: Graph): Map<string, number> {
  const gen = new Map<string, number>()
  const inProgress = new Set<string>()
  const depth = (id: string): number => {
    if (gen.has(id)) return gen.get(id)!
    if (inProgress.has(id)) return 0   // cycle guard
    inProgress.add(id)
    const parents = g.effParents.get(id)
    let d = 0
    if (parents && parents.size) {
      for (const p of parents) d = Math.max(d, depth(p) + 1)
    }
    inProgress.delete(id)
    gen.set(id, d)
    return d
  }
  for (const p of g.persons) depth(p.id)

  // Pull ONLY married-in (parentless) spouses up to their partner's generation, in a
  // single pass. This fixes a parentless spouse floating a row above their partner
  // without the divergence a full spouse↔child fixpoint suffers on cross-generation
  // marriages (e.g. an uncle–niece match), which used to inflate generations unbounded.
  // A pulled spouse never ends up at/below their own children: the child is already at
  // partner_gen+1, and the spouse is only raised to partner_gen.
  for (const partners of g.partnersOfUnion.values()) {
    const m = Math.max(0, ...partners.map(p => gen.get(p) ?? 0))
    for (const p of partners) if (!(g.effParents.get(p)?.size)) gen.set(p, m)
  }
  return gen
}

// Horizontal ordering: post-order descendant walk that keeps families together,
// centers parents over their children and flanks unions with their partners.
// Returns x in "slot" units (1 slot ≈ one person width).
function assignSlots(g: Graph, gen: Map<string, number>): Map<string, number> {
  const x = new Map<string, number>()
  const seenP = new Set<string>()
  const seenU = new Set<string>()
  let cursor = 0

  const placePerson = (pid: string): void => {
    if (seenP.has(pid)) return
    seenP.add(pid)
    const myUnions = (g.unionsOfPerson.get(pid) || []).filter(u => !seenU.has(u))
    const myDirect = (g.directChildren.get(pid) || []).filter(c => !seenP.has(c))

    if (!myUnions.length && !myDirect.length) {   // leaf
      x.set(pid, cursor); cursor += 1
      return
    }

    const anchors: number[] = []
    const singleSimple = myUnions.length === 1 && myDirect.length === 0
    let onlyUnionSpouse: string | null = null
    let onlyUnionCenter = 0

    for (const uid of myUnions) {
      seenU.add(uid)
      const partners = g.partnersOfUnion.get(uid) || []
      const spouse = partners.find(p => p !== pid) || null
      const kids = (g.childrenOfUnion.get(uid) || []).filter(c => !seenP.has(c))
      const kidCenters: number[] = []
      for (const k of kids) { placePerson(k); const kx = x.get(k); if (kx != null) kidCenters.push(kx) }
      let uc: number
      if (kidCenters.length) uc = (Math.min(...kidCenters) + Math.max(...kidCenters)) / 2
      else { uc = cursor; cursor += 1 }
      x.set(uid, uc)
      if (spouse && !seenP.has(spouse)) {
        seenP.add(spouse)
        x.set(spouse, uc + 0.6)   // flank to the right; final sweep spaces it out
        if (singleSimple) { onlyUnionSpouse = spouse; onlyUnionCenter = uc }
      }
      anchors.push(uc)
    }
    for (const c of myDirect) { placePerson(c); const cx = x.get(c); if (cx != null) anchors.push(cx) }

    if (singleSimple && onlyUnionSpouse) {
      // lineage person | union (over children) | spouse
      x.set(pid, onlyUnionCenter - 0.6)
      x.set(onlyUnionSpouse, onlyUnionCenter + 0.6)
    } else {
      x.set(pid, (Math.min(...anchors) + Math.max(...anchors)) / 2)
    }
  }

  // Roots = people with no effective parent. Process founders (those with the most
  // descendants) first so married-in, childless spouse-roots get flanked next to
  // their partner instead of floating off as their own root.
  const reach = (id: string): number => {
    const seen = new Set<string>([id]); const q = [id]; let c = 0
    while (q.length) { const cur = q.shift()!; for (const ch of g.effChildren.get(cur) || []) if (!seen.has(ch)) { seen.add(ch); q.push(ch); c++ } }
    return c
  }
  const roots = g.persons.filter(p => !(g.effParents.get(p.id)?.size))
  const reachOf = new Map(roots.map(r => [r.id, reach(r.id)]))
  roots.sort((a, b) => {
    const ra = reachOf.get(a.id)!, rb = reachOf.get(b.id)!
    if (ra !== rb) return rb - ra   // more descendants first
    const ya = parseYear(a.birth) ?? parseYear(a.death), yb = parseYear(b.birth) ?? parseYear(b.death)
    if (ya != null && yb != null && ya !== yb) return ya - yb
    if (ya != null && yb == null) return -1
    if (ya == null && yb != null) return 1
    return (a.name || a.id).localeCompare(b.name || b.id)
  })
  for (const r of roots) placePerson(r.id)
  for (const p of g.persons) placePerson(p.id)   // any left over (cycles/orphans)

  return x
}

// Layer (row index) for every drawn node: person = generation, union = its partners' row.
function layerOf(g: Graph, gen: Map<string, number>): Map<string, number> {
  const layer = new Map<string, number>()
  for (const p of g.persons) layer.set(p.id, gen.get(p.id) ?? 0)
  for (const [uid, partners] of g.partnersOfUnion) layer.set(uid, Math.max(0, ...partners.map(p => gen.get(p) ?? 0)))
  return layer
}

// Number of edge crossings between consecutive layers, given an ordering (pos =
// index within layer). Standard bilayer count: for the edges between layer L and
// L+1, sort by the upper endpoint's index and count inversions in the lower index
// sequence. This is the objective the Sugiyama sweeps minimize.
function countCrossings(g: Graph, layer: Map<string, number>, pos: Map<string, number>): number {
  const byPair = new Map<number, Array<[number, number]>>()   // upperLayer → [upperPos, lowerPos]
  for (const [child, parents] of g.drawParents) {
    const lc = layer.get(child); if (lc == null) continue
    for (const par of parents) {
      const lp = layer.get(par); if (lp == null || lp !== lc - 1) continue
      const a = byPair.get(lp) || []; a.push([pos.get(par) ?? 0, pos.get(child) ?? 0]); byPair.set(lp, a)
    }
  }
  let total = 0
  for (const arr of byPair.values()) {
    arr.sort((e1, e2) => e1[0] - e2[0] || e1[1] - e2[1])
    // count inversions in the lower-index sequence
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++)
        if (arr[i][1] > arr[j][1]) total++
  }
  return total
}

const median = (xs: number[]): number => {
  if (!xs.length) return -1
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Keep each couple contiguous: whenever a person is met, its unions and their
// spouses are pulled to sit immediately after it — [partner, union, spouse].
function compactCouples(g: Graph, arr: string[]): string[] {
  const placed = new Set<string>()
  const out: string[] = []
  const inThisLayer = new Set(arr)
  for (const id of arr) {
    if (placed.has(id)) continue
    const node = g.nodeMap.get(id)
    if (node && isUnion(node)) {
      // a union met before its partners: emit union then its partners
      out.push(id); placed.add(id)
      for (const p of g.partnersOfUnion.get(id) || []) if (inThisLayer.has(p) && !placed.has(p)) { out.push(p); placed.add(p) }
      continue
    }
    out.push(id); placed.add(id)
    for (const u of g.unionsOfPerson.get(id) || []) {
      if (inThisLayer.has(u) && !placed.has(u)) { out.push(u); placed.add(u) }
      for (const s of g.partnersOfUnion.get(u) || []) if (inThisLayer.has(s) && !placed.has(s)) { out.push(s); placed.add(s) }
    }
  }
  return out
}

// Sugiyama crossing reduction: median heuristic with alternating down/up sweeps,
// initialised from the family DFS order, keeping the best-scoring ordering seen.
// Returns pos = index within layer for every node.
function optimizeOrdering(g: Graph, layer: Map<string, number>, initX: Map<string, number>): Map<string, number> {
  const layers: string[][] = []
  for (const [id, l] of layer) { (layers[l] || (layers[l] = [])).push(id) }
  for (let l = 0; l < layers.length; l++) {
    if (!layers[l]) { layers[l] = []; continue }
    layers[l].sort((a, b) => (initX.get(a) ?? 0) - (initX.get(b) ?? 0))
    layers[l] = compactCouples(g, layers[l])
  }
  const posOf = (ls: string[][]) => {
    const p = new Map<string, number>()
    for (const arr of ls) arr.forEach((id, i) => p.set(id, i))
    return p
  }
  let pos = posOf(layers)
  let best = layers.map(a => [...a])
  let bestC = countCrossings(g, layer, pos)

  const reorder = (l: number, neighborKey: (id: string) => number) => {
    const arr = layers[l]
    const keyed = arr.map((id, i) => ({ id, k: neighborKey(id), i }))
    keyed.sort((a, b) => (a.k < 0 && b.k < 0 ? a.i - b.i : a.k < 0 ? 1 : b.k < 0 ? -1 : a.k - b.k || a.i - b.i))
    layers[l] = compactCouples(g, keyed.map(x => x.id))
  }

  // Neighbour index lists (in the adjacent layer) for the transpose step.
  const upN = (id: string, l: number) => (g.drawParents.get(id) || []).filter(p => layer.get(p) === l - 1)
  const downN = (id: string, l: number) => (g.drawChildrenNext.get(id) || []).filter(c => layer.get(c) === l + 1)
  const pairCross = (av: number[], bw: number[]) => { // crossings when the "av" node is left of the "bw" node
    let c = 0; for (const a of av) for (const b of bw) if (a > b) c++; return c
  }
  // Sugiyama transpose: swap adjacent nodes in a layer whenever it reduces the local
  // crossings on the layers above and below. Repeated until no improvement.
  const transpose = () => {
    let improved = true, guard = 0
    while (improved && guard++ < 6) {
      improved = false
      for (let l = 0; l < layers.length; l++) {
        const arr = layers[l]
        for (let i = 0; i + 1 < arr.length; i++) {
          const v = arr[i], w = arr[i + 1]
          const vu = upN(v, l).map(p => pos.get(p) ?? 0), wu = upN(w, l).map(p => pos.get(p) ?? 0)
          const vd = downN(v, l).map(p => pos.get(p) ?? 0), wd = downN(w, l).map(p => pos.get(p) ?? 0)
          const before = pairCross(vu, wu) + pairCross(vd, wd)
          const after = pairCross(wu, vu) + pairCross(wd, vd)
          if (after < before) {   // swap improves; keep couples adjacent though
            arr[i] = w; arr[i + 1] = v; pos.set(v, i + 1); pos.set(w, i); improved = true
          }
        }
      }
    }
  }

  for (let iter = 0; iter < 16; iter++) {
    const down = iter % 2 === 0
    if (down) {
      for (let l = 1; l < layers.length; l++)
        reorder(l, id => median((g.drawParents.get(id) || []).filter(p => layer.get(p) === l - 1).map(p => pos.get(p) ?? 0)))
    } else {
      for (let l = layers.length - 2; l >= 0; l--)
        reorder(l, id => median((g.drawChildrenNext.get(id) || []).filter(c => layer.get(c) === l + 1).map(c => pos.get(c) ?? 0)))
    }
    pos = posOf(layers)
    transpose()
    for (let l = 0; l < layers.length; l++) layers[l] = compactCouples(g, layers[l])
    pos = posOf(layers)
    const c = countCrossings(g, layer, pos)
    if (c < bestC) { bestC = c; best = layers.map(a => [...a]) }
  }
  return posOf(best)
}

const halfWidth = (n: LayoutNode | undefined, col: number) =>
  n && isUnion(n) ? col * 0.16 : col * 0.5

// Remove overlaps within each row while preserving left→right order, then nudge
// parents back toward the center of their children for tidiness.
function relaxRows(
  g: Graph,
  gen: Map<string, number>,
  px: Map<string, number>,
  rowOf: (id: string) => number,
  col: number,
) {
  const rows = new Map<number, string[]>()
  for (const [id, r] of [...px.keys()].map(id => [id, Math.round(rowOf(id) * 1000)] as const)) {
    const a = rows.get(r); if (a) a.push(id); else rows.set(r, [id])
  }
  const sweep = () => {
    for (const ids of rows.values()) {
      ids.sort((a, b) => (px.get(a)! - px.get(b)!))
      for (let i = 1; i < ids.length; i++) {
        const prev = ids[i - 1], cur = ids[i]
        const minGap = halfWidth(g.nodeMap.get(prev), col) + halfWidth(g.nodeMap.get(cur), col)
        if (px.get(cur)! - px.get(prev)! < minGap) px.set(cur, px.get(prev)! + minGap)
      }
    }
  }
  sweep()
  const couple = col * 0.55
  const hasKids = (uid: string) => (g.childrenOfUnion.get(uid)?.length ?? 0) > 0
  // A married-in spouse (no ancestry, one marriage, no own children) hugs its union;
  // lineage partners stay centered over their descendants.
  const isMarriedIn = (id: string) =>
    !(g.effParents.get(id)?.size) && (g.unionsOfPerson.get(id)?.length === 1) && !(g.directChildren.get(id)?.length)
  const lineagePartner = (partners: string[]) =>
    partners.find(p => !isMarriedIn(p)) ?? partners[0]

  // Centering passes: pull each union/parent toward its children, seat spouses beside
  // their union, seat childless unions next to their lineage partner, then re-sweep so
  // every row stays overlap-free.
  for (let pass = 0; pass < 5; pass++) {
    for (const [uid, kids] of g.childrenOfUnion) {
      const xs = kids.map(k => px.get(k)).filter((v): v is number => v != null)
      if (xs.length) px.set(uid, (Math.min(...xs) + Math.max(...xs)) / 2)
    }
    for (const p of g.persons) {
      // center over family anchors: unions WITH children + direct kids (childless unions
      // follow the person, not the other way around).
      const anchors: number[] = []
      for (const u of g.unionsOfPerson.get(p.id) || []) if (hasKids(u)) { const x = px.get(u); if (x != null) anchors.push(x) }
      for (const c of g.directChildren.get(p.id) || []) { const x = px.get(c); if (x != null) anchors.push(x) }
      if (anchors.length) {
        const c = (Math.min(...anchors) + Math.max(...anchors)) / 2
        px.set(p.id, (px.get(p.id)! + c) / 2)
      }
    }
    // Seat childed unions between their partners; place childless unions + spouse
    // beside the lineage partner.
    for (const [uid, partners] of g.partnersOfUnion) {
      if (partners.length !== 2) continue
      const lin = lineagePartner(partners)
      const sp = partners.find(p => p !== lin)!
      if (hasKids(uid)) {
        const ux = px.get(uid); if (ux == null) continue
        const side = (px.get(lin) ?? ux) <= ux ? 1 : -1
        px.set(sp, ux + side * couple)
      } else {
        const lx = px.get(lin); if (lx == null) continue
        px.set(uid, lx + couple)
        px.set(sp, lx + 2 * couple)
      }
    }
    sweep()
  }
}

// Fill in missing birth years from parents (+30), children (-30) and spouses (=),
// then pull any still-undated node toward a connected dated neighbour over ANY edge.
function inferYears(g: Graph, links: LayoutLink[]): Map<string, number> {
  const year = new Map<string, number>()
  for (const p of g.persons) {
    const y = parseYear(p.birth) ?? (parseYear(p.death) != null ? parseYear(p.death)! - 50 : null)
    if (y != null) year.set(p.id, y)
  }
  const spouseOf = new Map<string, Set<string>>()
  for (const partners of g.partnersOfUnion.values()) {
    for (const a of partners) for (const b of partners) {
      if (a === b) continue
      if (!spouseOf.has(a)) spouseOf.set(a, new Set()); spouseOf.get(a)!.add(b)
    }
  }
  for (let pass = 0; pass < 12; pass++) {
    let changed = false
    for (const p of g.persons) {
      if (year.has(p.id)) continue
      const cand: number[] = []
      for (const par of g.effParents.get(p.id) || []) { const y = year.get(par); if (y != null) cand.push(y + 30) }
      for (const ch of g.effChildren.get(p.id) || []) { const y = year.get(ch); if (y != null) cand.push(y - 30) }
      for (const sp of spouseOf.get(p.id) || []) { const y = year.get(sp); if (y != null) cand.push(y) }
      if (cand.length) {
        cand.sort((a, b) => a - b)
        year.set(p.id, Math.round(cand[Math.floor(cand.length / 2)]))
        changed = true
      }
    }
    if (!changed) break
  }

  // Pull any STILL-undated node (e.g. a 著作 work stub, or a person linked only by a
  // non-family edge like 師) toward a connected dated neighbour over ANY link type, so it
  // sits near that node on the time axis instead of being dumped at the very top.
  const adj = new Map<string, string[]>()
  const link = (a: string, b: string) => { const x = adj.get(a); if (x) x.push(b); else adj.set(a, [b]) }
  for (const l of links) {
    if (!g.nodeMap.has(l.source) || !g.nodeMap.has(l.target)) continue
    link(l.source, l.target); link(l.target, l.source)
  }
  for (let pass = 0; pass < 8; pass++) {
    let changed = false
    for (const p of g.persons) {
      if (year.has(p.id)) continue
      const cand = (adj.get(p.id) || []).map(n => year.get(n)).filter((v): v is number => v != null)
      if (cand.length) {
        cand.sort((a, b) => a - b)
        year.set(p.id, Math.round(cand[Math.floor(cand.length / 2)]))
        changed = true
      }
    }
    if (!changed) break
  }
  return year
}

// Auto mode selection: plentiful, well-spread dates + a generational tree → timeline;
// a tree but sparse dates → tidy; otherwise (little date info AND no clear generations,
// e.g. a relationship web) → force (organic clusters). The 'force' layout itself runs
// in the canvas component (it needs d3-force); this only picks the strategy.
export function pickAutoMode(nodes: LayoutNode[], links: LayoutLink[]): 'tidy' | 'timeline' | 'force' {
  const persons = nodes.filter(n => !isUnion(n) && n.type !== 'note')
  if (!persons.length) return 'tidy'
  const dated = persons.filter(p => parseYear(p.birth) != null || parseYear(p.death) != null)
  const years = dated.map(p => parseYear(p.birth) ?? parseYear(p.death)!).sort((a, b) => a - b)
  const datedSpan = years.length ? years[years.length - 1] - years[0] : 0
  const ratio = dated.length / persons.length
  const parentChild = links.filter(l => l.type === 'parent-child').length
  const treeLike = parentChild >= persons.length * 0.25
  if (ratio >= 0.6 && datedSpan >= 40 && treeLike) return 'timeline'
  if (treeLike) return 'tidy'
  return 'force'
}

// Split the graph into lineage blocks with a union-find so a nuclear family (both
// parents + their union node + their children) is always in ONE block — the father is
// never separated from his own children, whichever parent sorts first. A childless
// marriage does NOT merge the two sides, so intermarried lineages (e.g. Sun vs Liu)
// stay as separate blocks that can be staggered; a married-in spouse with no family of
// their own is still folded into their partner's block. Cross-block edges (marriages
// between lineages) are drawn by the canvas as connectors.
function lineageBlocks(nodes: LayoutNode[], links: LayoutLink[]): string[][] {
  const g = buildGraph(nodes, links)
  const parent = new Map<string, string>(nodes.map(n => [n.id, n.id]))
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    while (parent.get(x) !== r) { const nx = parent.get(x)!; parent.set(x, r); x = nx }
    return r
  }
  const merge = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }

  const genderOf = (id: string) => g.nodeMap.get(id)?.gender
  const husbandOf = (partners: string[]) => partners.find(p => genderOf(p) === 'male') ?? partners[0]

  // A married-out spouse joins their partner's line rather than staying in their birth
  // family (patrilineal convention: the wife goes to the husband's block). This is what
  // makes each blood lineage its OWN block and turns marriages into cross-block bridges.
  const marriedOut = new Set<string>()
  for (const partners of g.partnersOfUnion.values()) {
    const h = husbandOf(partners)
    for (const p of partners) if (p !== h) marriedOut.add(p)
  }

  // 1. Children join their father's patriline (sons + not-married-out daughters). A
  //    married-out daughter instead joins her husband (step 2), so skip her here.
  for (const [child, parents] of g.effParents) {
    if (marriedOut.has(child)) continue
    const arr = [...parents]
    const father = arr.find(p => genderOf(p) === 'male')
    const established = arr.filter(p => g.effParents.get(p)?.size)
    merge(child, father ?? established[0] ?? arr.slice().sort()[0])
  }
  // 2. Each union: the spouse(s) and the union node join the husband's block.
  for (const [uid, partners] of g.partnersOfUnion) {
    const h = husbandOf(partners)
    merge(uid, h)
    for (const p of partners) if (p !== h) merge(p, h)
  }
  // 3. Single-parent children (not married-out) join that parent.
  for (const [pid, kids] of g.directChildren) for (const k of kids) if (!marriedOut.has(k)) merge(k, pid)

  // 4. Fold a lone in-law (a block of a single person, e.g. the father of a married-in
  //    wife) into a block it connects to, so isolated dots don't litter the packing.
  const groups = () => {
    const m = new Map<string, string[]>()
    for (const id of parent.keys()) { const r = find(id); (m.get(r) || m.set(r, []).get(r)!).push(id) }
    return m
  }
  let sizes = new Map([...groups()].map(([r, ids]) => [r, ids.length]))
  for (const l of links) {
    const s = g.nodeMap.get(l.source), t = g.nodeMap.get(l.target)
    if (!s || !t) continue
    const rs = find(s.id), rt = find(t.id)
    if (rs === rt) continue
    if ((sizes.get(rs) || 0) === 1) { merge(rs, rt); sizes = new Map([...groups()].map(([r, ids]) => [r, ids.length])) }
    else if ((sizes.get(rt) || 0) === 1) { merge(rt, rs); sizes = new Map([...groups()].map(([r, ids]) => [r, ids.length])) }
  }

  return [...groups().values()]
}

// Connected components (independent families / separate imports) over all nodes.
function connectedComponents(nodes: LayoutNode[], links: LayoutLink[]): string[][] {
  const ids = new Set(nodes.map(n => n.id))
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const l of links) if (ids.has(l.source) && ids.has(l.target)) {
    adj.get(l.source)!.push(l.target); adj.get(l.target)!.push(l.source)
  }
  const seen = new Set<string>()
  const comps: string[][] = []
  for (const n of nodes) {
    if (seen.has(n.id)) continue
    const comp: string[] = []; const q = [n.id]; seen.add(n.id)
    while (q.length) { const x = q.shift()!; comp.push(x); for (const nb of adj.get(x) || []) if (!seen.has(nb)) { seen.add(nb); q.push(nb) } }
    comps.push(comp)
  }
  return comps
}

interface Laid { positions: Record<string, { x: number; y: number }>; minX: number; minY: number; w: number; h: number; size: number }

function measure(positions: Record<string, { x: number; y: number }>, size: number, pad: number): Laid {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const id in positions) {
    const p = positions[id]
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
  }
  if (!Number.isFinite(minX)) { minX = minY = 0; maxX = maxY = 0 }
  return { positions, minX: minX - pad, minY: minY - pad, w: (maxX - minX) + 2 * pad, h: (maxY - minY) + 2 * pad, size }
}

// Shelf-pack blocks into a roughly square area, zigzagging every other block in a row
// (dropped down) so neighbours are easy to tell apart and connector lines don't pile up.
function shelfPack(laid: Laid[], col: number, gap: number, centerX: number, topY: number): Record<string, { x: number; y: number }> {
  laid.sort((a, b) => b.size - a.size || b.w - a.w)
  const totalArea = laid.reduce((s, c) => s + c.w * c.h, 0)
  const maxRow = Math.max(laid[0].w, Math.sqrt(totalArea) * 1.5)
  const zig = (h: number) => Math.min(h * 0.6, col * 1.6)
  let x = 0, y = 0, rowH = 0, col0 = 0
  const out: Record<string, { x: number; y: number }> = {}
  for (const c of laid) {
    if (x > 0 && x + c.w > maxRow) { x = 0; y += rowH + gap; rowH = 0; col0 = 0 }
    const stagger = (col0 % 2) * zig(c.h)
    const ox = x - c.minX, oy = y + stagger - c.minY
    for (const id in c.positions) out[id] = { x: c.positions[id].x + ox, y: c.positions[id].y + oy }
    x += c.w + gap; rowH = Math.max(rowH, c.h + stagger); col0++
  }
  const xs = Object.values(out).map(p => p.x), ys = Object.values(out).map(p => p.y)
  const shiftX = centerX - (Math.min(...xs) + Math.max(...xs)) / 2
  const shiftY = topY - Math.min(...ys)
  for (const id in out) { out[id].x += shiftX; out[id].y += shiftY }
  return out
}

// Lay out ONE connected component: split into lineage blocks and pack them (tight gap).
function layoutOneComponent(nodes: LayoutNode[], links: LayoutLink[], options: LayoutOptions, resolved: 'tidy' | 'timeline'): LayoutResult {
  const comps = lineageBlocks(nodes, links)
  if (comps.length <= 1) return computeSingleLayout(nodes, links, { ...options, mode: resolved })
  const col = options.colGap ?? 150
  const laid = comps.map(idsArr => {
    const idset = new Set(idsArr)
    const sub = nodes.filter(n => idset.has(n.id))
    const subLinks = links.filter(l => idset.has(l.source) && idset.has(l.target))
    const { positions } = computeSingleLayout(sub, subLinks, { ...options, mode: resolved, centerX: 0, topY: 0 })
    return measure(positions, idset.size, col * 0.3)
  })
  const out = shelfPack(laid, col, col * 0.7, options.centerX ?? 600, options.topY ?? 100)
  return { positions: out, mode: resolved }
}

// Adaptive (non-linear) year→y mapping: every year that has people advances by a fixed
// step (busy periods stretched, like a zoom), empty stretches add only a small capped
// gap. Returns the mapping fn plus the list of occupied years (for drawing the axis).
export function buildYearAxis(occupied: number[], topY: number, rowGap: number): { yForYear: (y: number) => number; ticks: Array<{ year: number; y: number }> } {
  const map = new Map<number, number>()
  let cy = topY
  occupied.forEach((yv, i) => {
    // Each occupied year advances by a base step (enough to clear a node), plus a small
    // capped term for the real time gap. Keeps busy periods stretched without the whole
    // axis becoming absurdly tall.
    if (i > 0) cy += rowGap * 0.5 + Math.min((yv - occupied[i - 1]) * (rowGap / 45), rowGap * 1.2)
    map.set(yv, cy)
  })
  const yForYear = (y: number): number => {
    if (map.has(y)) return map.get(y)!
    if (!occupied.length) return topY
    if (y <= occupied[0]) return map.get(occupied[0])!
    if (y >= occupied[occupied.length - 1]) return map.get(occupied[occupied.length - 1])!
    let lo = occupied[0]
    for (const o of occupied) { if (o <= y) lo = o; else break }
    const hi = occupied.find(o => o > y)!
    return map.get(lo)! + ((y - lo) / (hi - lo)) * (map.get(hi)! - map.get(lo)!)
  }
  return { yForYear, ticks: occupied.map(year => ({ year, y: map.get(year)! })) }
}

// Timeline: ONE global adaptive time axis shared by every cluster (so a left-hand year
// axis is meaningful), with clusters laid out in separate horizontal lanes. Each cluster
// keeps its internal family x-order (and spine zigzag) from the core layout; y is then
// overwritten with the global year mapping.
function layoutTimeline(nodes: LayoutNode[], links: LayoutLink[], options: LayoutOptions): LayoutResult {
  const centerX = options.centerX ?? 600
  const topY = options.topY ?? 100
  const col = options.colGap ?? 150
  const rowGap = options.rowGap ?? 160
  const laneGap = col * 1.4

  const g = buildGraph(nodes, links)
  if (!g.persons.length) return { positions: {}, mode: 'timeline' }
  const year = inferYears(g, links)
  const occupied = [...new Set([...year.values()])].sort((a, b) => a - b)
  const { yForYear } = buildYearAxis(occupied, topY, rowGap)

  const comps = connectedComponents(nodes, links).sort((a, b) => b.length - a.length)
  let laneX = 0
  const out: Record<string, { x: number; y: number }> = {}
  for (const compIds of comps) {
    const set = new Set(compIds)
    const sub = nodes.filter(n => set.has(n.id))
    const subLinks = links.filter(l => set.has(l.source) && set.has(l.target))

    // Chain-like line (e.g. an emperor succession): snake it left↔right across a bounded
    // number of columns (options.timelineCols), ordered by year down the axis, so a long
    // temporal chain stays readable instead of drifting ever rightwards.
    if (isChainLike(sub, subLinks)) {
      const C = Math.max(2, Math.round(options.timelineCols ?? 4))
      const period = 2 * (C - 1)
      const boustro = (i: number) => { const c = i % period; return c < C ? c : period - c }   // 0..C-1..1

      // Split into ROOT lineages by succession/血縁 only — a 朝代更换(custom) does NOT merge
      // two lineages — so each dynasty/root line is separate, ordered along its own chain.
      const spineLinks = subLinks.filter(l => l.type !== 'custom')
      const groups = connectedComponents(sub, spineLinks)
        .map(ids => {
          const order = chainOrder(ids.filter(id => year.get(id) != null), subLinks, id => year.get(id))
          const undated = ids.filter(id => year.get(id) == null)
          const ys = order.map(id => year.get(id)!)
          return { order, undated, minY: ys.length ? Math.min(...ys) : Infinity, maxY: ys.length ? Math.max(...ys) : -Infinity }
        })
        .filter(g => g.order.length)
        .sort((a, b) => a.minY - b.minY)

      // Pack lineages into x-lanes (interval partitioning): a lane is reused once its previous
      // line has ended, so SEQUENTIAL dynasties stack in one lane while CONCURRENT lineages
      // (different roots at the same era, e.g. 南宋 vs 元) get separate, side-by-side lanes.
      // Total width = the MAX number of concurrent lineages, not the total node count.
      const laneStride = (C - 1) * col + laneGap
      const laneEnd: number[] = []
      for (const g of groups) {
        let lane = laneEnd.findIndex(end => end <= g.minY)
        if (lane === -1) { lane = laneEnd.length; laneEnd.push(-Infinity) }
        laneEnd[lane] = g.maxY
        const baseX = laneX + lane * laneStride
        g.order.forEach((id, i) => { out[id] = { x: baseX + boustro(i) * col, y: yForYear(year.get(id)!) } })
        for (const id of g.undated) if (out[id] == null) out[id] = { x: baseX, y: NaN }
      }
      for (const n of sub) if (out[n.id] == null) out[n.id] = { x: laneX, y: NaN }
      laneX += Math.max(1, laneEnd.length) * laneStride
      continue
    }

    const { positions } = computeSingleLayout(sub, subLinks, { ...options, mode: 'timeline', centerX: 0, topY: 0 })
    const pxs = Object.values(positions).map(p => p.x)
    const minX = pxs.length ? Math.min(...pxs) : 0, maxX = pxs.length ? Math.max(...pxs) : 0
    for (const id in positions) {
      const yv = year.get(id)
      out[id] = { x: positions[id].x - minX + laneX, y: yv != null ? yForYear(yv) : NaN }
    }
    laneX += (maxX - minX) + laneGap
  }
  // Unions / undated: derive y from partners (or leave at top).
  for (const [uid] of g.partnersOfUnion) {
    const ps = (g.partnersOfUnion.get(uid) || []).map(p => out[p]?.y).filter(v => Number.isFinite(v)) as number[]
    if (out[uid] && ps.length) out[uid].y = ps.reduce((a, b) => a + b, 0) / ps.length
  }
  for (const id in out) if (!Number.isFinite(out[id].y)) out[id].y = topY

  // Attach undated "satellites" (e.g. 著作 works) right beside their dated anchor instead of
  // letting the chain / component layout fling them sideways. Only touches nodes with NO
  // explicit year, so fully-dated charts (emperors etc.) are completely unaffected.
  const hasExplicitYear = (id: string) => {
    const n = g.nodeMap.get(id)
    return n ? (parseYear(n.birth) ?? parseYear(n.death)) != null : false
  }
  const nbr = new Map<string, string[]>()
  const addNbr = (a: string, b: string) => { const x = nbr.get(a); if (x) x.push(b); else nbr.set(a, [b]) }
  for (const l of links) {
    if (g.nodeMap.has(l.source) && g.nodeMap.has(l.target)) { addNbr(l.source, l.target); addNbr(l.target, l.source) }
  }
  const fanCount = new Map<string, number>()
  for (const n of g.persons) {
    if (hasExplicitYear(n.id) || out[n.id] == null) continue
    const anchor = (nbr.get(n.id) || []).find(m => hasExplicitYear(m) && out[m])
    if (!anchor) continue
    const k = fanCount.get(anchor) ?? 0; fanCount.set(anchor, k + 1)   // stack multiple works in a small grid beside the author
    out[n.id] = {
      x: out[anchor].x + col * 0.8 + Math.floor(k / 3) * (col * 0.7),
      y: out[anchor].y + ((k % 3) - 1) * (rowGap * 0.3),
    }
  }

  const xs = Object.values(out).map(p => p.x)
  const shiftX = centerX - (Math.min(...xs) + Math.max(...xs)) / 2
  for (const id in out) out[id].x += shiftX
  return { positions: out, mode: 'timeline' }
}

// Public entry — unified pipeline. Step 1: split into independent components (separate
// imports / unrelated families) so they never interleave. Step 2: within each component,
// analyse the relationship graph into lineage clusters and lay each out per the chosen
// view (系図 tidy / timeline). Step 3: pack lineage blocks within a component (tight),
// then pack whole components apart (wide gap) so unrelated families are clearly separated.
export function computeFamilyLayout(
  nodes: LayoutNode[],
  links: LayoutLink[],
  options: LayoutOptions = {},
): LayoutResult {
  const resolved = options.mode && options.mode !== 'auto' ? options.mode : pickAutoMode(nodes, links)
  // 'force' is produced by the canvas component; anything else uses the cluster pipeline.
  if (resolved !== 'tidy' && resolved !== 'timeline') return computeSingleLayout(nodes, links, { ...options, mode: resolved })
  // Timeline: one global time axis + horizontal cluster lanes (so a left year axis fits).
  if (resolved === 'timeline') return layoutTimeline(nodes, links, options)

  const components = connectedComponents(nodes, links)
  if (components.length <= 1) return layoutOneComponent(nodes, links, options, resolved)

  const col = options.colGap ?? 150
  const laid = components.map(compIds => {
    const idset = new Set(compIds)
    const sub = nodes.filter(n => idset.has(n.id))
    const subLinks = links.filter(l => idset.has(l.source) && idset.has(l.target))
    const { positions } = layoutOneComponent(sub, subLinks, { ...options, centerX: 0, topY: 0 }, resolved)
    return measure(positions, idset.size, col * 0.5)
  })
  // Independent components separated with a wide gap so separate imports don't cross.
  const out = shelfPack(laid, col, col * 1.6, options.centerX ?? 600, options.topY ?? 100)
  return { positions: out, mode: resolved }
}

function computeSingleLayout(
  nodes: LayoutNode[],
  links: LayoutLink[],
  options: LayoutOptions = {},
): LayoutResult {
  const centerX = options.centerX ?? 600
  const topY = options.topY ?? 100
  const col = options.colGap ?? 150
  const rowGap = options.rowGap ?? 160

  const g = buildGraph(nodes, links)
  if (!g.persons.length) return { positions: {}, mode: 'tidy' }

  // Resolve mode. 'force' is handled by the canvas component (needs d3-force); if this
  // function is ever asked for it, fall back to tidy so it always returns positions.
  const resolved = options.mode && options.mode !== 'auto' ? options.mode : pickAutoMode(nodes, links)
  const mode: 'tidy' | 'timeline' = resolved === 'timeline' ? 'timeline' : 'tidy'

  const gen = assignGenerations(g)
  const slots = assignSlots(g, gen)                 // family-DFS initial order (low crossings, couples together)
  const layer = layerOf(g, gen)
  const order = optimizeOrdering(g, layer, slots)   // Sugiyama crossing minimization

  // Horizontal pixels from the crossing-minimized order (shared by both modes).
  // relaxRows then pulls parents over their children and removes overlaps.
  const px = new Map<string, number>()
  for (const [id, i] of order) px.set(id, i * col)

  // Vertical: generation rows (tidy) or year axis (timeline).
  const rowValue = new Map<string, number>()   // fractional "row" used only for row grouping in relax
  const yOf = new Map<string, number>()

  if (mode === 'tidy') {
    for (const p of g.persons) { const gg = gen.get(p.id) ?? 0; rowValue.set(p.id, gg); yOf.set(p.id, topY + gg * rowGap) }
    for (const uid of g.partnersOfUnion.keys()) {
      const partners = g.partnersOfUnion.get(uid) || []
      const gg = Math.max(0, ...partners.map(p => gen.get(p) ?? 0))
      rowValue.set(uid, gg); yOf.set(uid, topY + gg * rowGap)
    }
  } else {
    const year = inferYears(g, links)
    // Adaptive (non-linear) time axis: every year that actually has people advances by a
    // fixed step, so a crowded period is stretched out (effectively magnified, like a
    // zoom on that range), while empty stretches between eras only add a small, capped
    // gap instead of a huge blank. This directly answers "magnify the busy period".
    const occupied = [...new Set([...year.values()])].sort((a, b) => a - b)
    const yForYear = (() => {
      const map = new Map<number, number>()
      let cy = topY
      occupied.forEach((yv, i) => {
        if (i > 0) {
          const gapYears = yv - occupied[i - 1]
          cy += rowGap + Math.min(gapYears * (rowGap / 30), rowGap * 2) // 1 step per era + capped time gap
        }
        map.set(yv, cy)
      })
      // Interpolate for inferred/union years that fall between occupied years.
      return (y: number) => {
        if (map.has(y)) return map.get(y)!
        if (!occupied.length) return topY
        if (y <= occupied[0]) return map.get(occupied[0])!
        if (y >= occupied[occupied.length - 1]) return map.get(occupied[occupied.length - 1])!
        let lo = occupied[0]
        for (const o of occupied) { if (o <= y) lo = o; else break }
        const hi = occupied.find(o => o > y)!
        const t = (y - lo) / (hi - lo)
        return map.get(lo)! + t * (map.get(hi)! - map.get(lo)!)
      }
    })()
    const minY = occupied.length ? occupied[0] : 0
    for (const p of g.persons) {
      const y = year.get(p.id)
      const yy = y != null ? yForYear(y) : topY + (gen.get(p.id) ?? 0) * rowGap
      rowValue.set(p.id, y != null ? y : (minY + (gen.get(p.id) ?? 0) * 25))
      yOf.set(p.id, yy)
    }
    for (const uid of g.partnersOfUnion.keys()) {
      const partners = g.partnersOfUnion.get(uid) || []
      const ys = partners.map(p => year.get(p)).filter((v): v is number => v != null)
      const uy = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null
      rowValue.set(uid, uy != null ? uy : (minY + Math.max(0, ...partners.map(p => gen.get(p) ?? 0)) * 25))
      yOf.set(uid, uy != null ? yForYear(uy) : (partners.length ? Math.max(...partners.map(p => yOf.get(p) ?? topY)) : topY))
    }
  }

  // Overlap removal + centering uses row buckets. In timeline mode people at nearly
  // the same y share a bucket so near-contemporaries don't overlap horizontally.
  const bucket = mode === 'timeline'
    ? (id: string) => Math.round((yOf.get(id) ?? 0) / (rowGap * 0.6))
    : (id: string) => rowValue.get(id) ?? 0
  relaxRows(g, gen, px, bucket, col)

  // Multiple marriages: stagger each spouse + their union vertically around the shared
  // partner so it is clear which children belong to which marriage (otherwise the two
  // unions sit on one row and the child-groups blur together). Tidy view only.
  if (mode === 'tidy') {
    const VST = rowGap * 0.34
    for (const p of g.persons) {
      const us = (g.unionsOfPerson.get(p.id) || []).filter(u => yOf.has(u))
      if (us.length < 2) continue
      us.sort((a, b) => (px.get(a) ?? 0) - (px.get(b) ?? 0))
      us.forEach((u, i) => {
        const dy = (i - (us.length - 1) / 2) * VST
        yOf.set(u, (yOf.get(u) ?? topY) + dy)
        const sp = (g.partnersOfUnion.get(u) || []).find(x => x !== p.id)
        if (sp && yOf.has(sp)) yOf.set(sp, (yOf.get(sp) ?? topY) + dy)
      })
    }
  }

  // Horizontal zigzag for vertical "spine" runs (both 系図 and timeline): shift a node
  // left/right by its GENERATION parity so a long straight vertical lineage (e.g. the
  // shogun succession) fans into a readable left–right zigzag. Only SPARSE generations
  // (a lone-heir chain, ≤2 people incl. spouse) are moved; wide branching generations
  // stay centered so they aren't tilted.
  {
    const genOf = (id: string) =>
      isUnion(g.nodeMap.get(id)!)
        ? Math.max(0, ...(g.partnersOfUnion.get(id) || []).map(p => gen.get(p) ?? 0))
        : (gen.get(id) ?? 0)
    const perGen = new Map<number, number>()
    for (const p of g.persons) { const gg = gen.get(p.id) ?? 0; perGen.set(gg, (perGen.get(gg) ?? 0) + 1) }
    // Amplitude grows with depth so a long lone-heir chain opens into a wider fan the
    // further down it goes (deeper generation → bigger swing), capped so it stays sane.
    const base = mode === 'timeline' ? col * 1.1 : col * 0.6
    for (const id of px.keys()) {
      const gg = genOf(id)
      if ((perGen.get(gg) ?? 0) > 2) continue   // keep branching generations centered
      const amp = base * (1 + Math.min(gg, 12) * 0.22)
      px.set(id, (px.get(id) ?? 0) + (gg % 2 === 0 ? -1 : 1) * amp)
    }
  }

  // Center the whole thing on centerX.
  const xs = [...px.values()]
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2
  const shift = centerX - mid

  const positions: Record<string, { x: number; y: number }> = {}
  for (const id of px.keys()) positions[id] = { x: px.get(id)! + shift, y: yOf.get(id) ?? topY }
  return { positions, mode }
}
