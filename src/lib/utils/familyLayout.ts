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
}

export interface LayoutResult {
  positions: Record<string, { x: number; y: number }>
  mode: 'tidy' | 'timeline'
}

// Extract a signed integer year from strings like "1543", "1543-06-23", "155".
// Era names (e.g. "享保12") return null — they can't be placed on a numeric axis.
export function parseYear(s?: string): number | null {
  if (!s) return null
  const m = String(s).match(/-?\d{1,4}/)
  if (!m) return null
  const n = parseInt(m[0], 10)
  return Number.isFinite(n) ? n : null
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

// Fill in missing birth years from parents (+30), children (-30) and spouses (=).
function inferYears(g: Graph): Map<string, number> {
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

// Public entry — unified pipeline. Step 1: analyse the relationship graph and split it
// into lineage clusters (the "relationship map" foundation). Step 2: lay each cluster
// out internally with the chosen view — 系図 (tidy, top→down) or timeline (by year,
// anchored on the cluster's dated members; others are approximate). Step 3: pack the
// clusters as non-overlapping blocks (stacked vertically and across). Both 系図 and
// timeline share this, so families never tangle and unrelated people never overlap.
export function computeFamilyLayout(
  nodes: LayoutNode[],
  links: LayoutLink[],
  options: LayoutOptions = {},
): LayoutResult {
  const resolved = options.mode && options.mode !== 'auto' ? options.mode : pickAutoMode(nodes, links)
  // 'force' is produced by the canvas component; anything else uses the cluster pipeline.
  if (resolved !== 'tidy' && resolved !== 'timeline') return computeSingleLayout(nodes, links, { ...options, mode: resolved })

  const comps = lineageBlocks(nodes, links)
  if (comps.length <= 1) return computeSingleLayout(nodes, links, { ...options, mode: resolved })

  const centerX = options.centerX ?? 600
  const topY = options.topY ?? 100
  const col = options.colGap ?? 150
  const gap = col * 0.7   // spacing between packed lineage blocks (kept tight)

  // Lay out each cluster locally (centred on 0,0), measure its bounding box.
  const laid = comps.map(idsArr => {
    const idset = new Set(idsArr)
    const sub = nodes.filter(n => idset.has(n.id))
    const subLinks = links.filter(l => idset.has(l.source) && idset.has(l.target))
    const { positions } = computeSingleLayout(sub, subLinks, { ...options, mode: resolved, centerX: 0, topY: 0 })
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const id in positions) {
      const p = positions[id]
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
    }
    if (!Number.isFinite(minX)) { minX = minY = 0; maxX = maxY = 0 }
    const pad = col * 0.3
    return { positions, minX: minX - pad, minY: minY - pad, w: (maxX - minX) + 2 * pad, h: (maxY - minY) + 2 * pad, size: idset.size }
  })
  // Biggest family first; isolated people (size 1) drift to the end.
  laid.sort((a, b) => b.size - a.size || b.w - a.w)

  // Shelf-pack the cluster boxes into a roughly square overall area (so blocks stagger
  // both across and down instead of forming one very tall column). The largest block
  // still sets a lower bound on the row width so it never wraps mid-family.
  const totalArea = laid.reduce((s, c) => s + c.w * c.h, 0)
  const maxRow = Math.max(laid[0].w, Math.sqrt(totalArea) * 1.5)
  // Zigzag the blocks in each row (every other block dropped down) so horizontally
  // adjacent clusters are easy to tell apart and their cross-block connector lines sit
  // at different heights instead of piling up in one dense band.
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
  // Recenter horizontally on centerX, top at topY.
  const xs = Object.values(out).map(p => p.x), ys = Object.values(out).map(p => p.y)
  const shiftX = centerX - (Math.min(...xs) + Math.max(...xs)) / 2
  const shiftY = topY - Math.min(...ys)
  for (const id in out) { out[id].x += shiftX; out[id].y += shiftY }
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
    const year = inferYears(g)
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

  // Center the whole thing on centerX.
  const xs = [...px.values()]
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2
  const shift = centerX - mid

  const positions: Record<string, { x: number; y: number }> = {}
  for (const id of px.keys()) positions[id] = { x: px.get(id)! + shift, y: yOf.get(id) ?? topY }
  return { positions, mode }
}
