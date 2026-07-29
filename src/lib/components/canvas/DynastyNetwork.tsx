'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import type { PersonNode, Relationship } from '@/types/charts'
import { isDecorShape, drawShapeArt, decorSize, decorMeta, ensureShapeArtDefs,
  isPortraitShape, drawPortraitFrame, drawPersonSilhouette, portraitMeta } from './shapeArt'

interface DynastyNetworkProps {
  persons: PersonNode[]
  relationships: Relationship[]
  selectedNodeId?: string | null
  connectSourceId?: string | null
  connectMode?: boolean
  onNodeClick: (node: PersonNode, screenX: number, screenY: number) => void
  onNodeCtrlClick?: (id: string, screenX: number, screenY: number) => void
  onEdgeClick: (rel: Relationship, screenX: number, screenY: number) => void
  onConnectRequest: (sourceId: string, targetId: string) => void
  onAddPerson: (x: number, y: number) => void
  onPositionChange: (id: string, x: number, y: number) => void
  onBatchPositionChange: (positions: Record<string, { x: number; y: number }>) => void
  onNodeUpdate?: (id: string, updates: Partial<PersonNode>) => void
}

type SimNode = PersonNode & {
  index?: number
  x: number
  y: number
  vx?: number
  vy?: number
}

type SimLink = Omit<Relationship, 'source' | 'target'> & {
  index?: number
  source: SimNode
  target: SimNode
}

// ── helpers ──────────────────────────────────────────────────────────────────

function nodeFill(d: SimNode): string {
  if (d.bgColor) return d.bgColor
  if (d.type === 'union') return '#f97316'
  return d.gender === 'male' ? '#3b82f6' : d.gender === 'female' ? '#ec4899' : '#64748b'
}

function nodeStroke(d: SimNode): string {
  if (d.borderColor) return d.borderColor
  const c = d3.color(nodeFill(d))
  return c ? (c as d3.RGBColor).darker(0.5).toString() : '#475569'
}

function isVideoUrl(url?: string): boolean {
  return !!url && /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url)
}

function hexPoints(r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60) - 30) * Math.PI / 180
    return `${r * Math.cos(a)},${r * Math.sin(a)}`
  }).join(' ')
}

function starPoints(r: number): string {
  const inner = r * 0.42
  return Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2
    const rr = i % 2 === 0 ? r : inner
    return `${rr * Math.cos(a)},${rr * Math.sin(a)}`
  }).join(' ')
}

function shieldPath(s: number): string {
  return `M ${-s} ${-s} L ${s} ${-s} L ${s} ${s * 0.2} Q ${s} ${s} 0 ${s} Q ${-s} ${s} ${-s} ${s * 0.2} Z`
}

// Comic speech bubble: rounded rect (hw×hh) with a small tail at the bottom-left
function bubblePath(hw: number, hh: number): string {
  const r = Math.min(hw, hh) * 0.3
  return `M ${-hw + r} ${-hh}
    L ${hw - r} ${-hh} Q ${hw} ${-hh} ${hw} ${-hh + r}
    L ${hw} ${hh - r} Q ${hw} ${hh} ${hw - r} ${hh}
    L ${-hw * 0.25} ${hh} L ${-hw * 0.45} ${hh + hh * 0.55} L ${-hw * 0.55} ${hh}
    L ${-hw + r} ${hh} Q ${-hw} ${hh} ${-hw} ${hh - r}
    L ${-hw} ${-hh + r} Q ${-hw} ${-hh} ${-hw + r} ${-hh} Z`
}

// Flyer tag/label: rect with a cut top-right corner
function tagPath(hw: number, hh: number): string {
  const cut = hh * 0.55
  return `M ${-hw} ${-hh} L ${hw - cut} ${-hh} L ${hw} ${-hh + cut} L ${hw} ${hh} L ${-hw} ${hh} Z`
}

function getNodeRadius(d: SimNode): number {
  if (d.type === 'union') return 12
  const s = d.nodeSize || 40
  if (isDecorShape(d.shape)) {
    const { w, h } = decorSize(d.shape, s)
    return Math.hypot(w / 2, h / 2)
  }
  switch (d.shape) {
    case 'rect': return Math.hypot(s * 1.5, s)
    case 'band': return Math.hypot((d.bandWidth || 200) / 2, (d.bandHeight || 30) / 2)
    case 'ellipse': return s * 1.4
    case 'bubble': return Math.hypot(s * 1.4, s * 0.9)
    case 'tag': return Math.hypot(s * 1.3, s)
    default: return s   // circle, diamond, hexagon, star, shield, seal
  }
}

function getPortPositions(d: SimNode): Array<{ x: number; y: number }> {
  if (d.type === 'union') {
    return [{ x: 0, y: -17 }, { x: 0, y: 17 }, { x: 17, y: 0 }, { x: -17, y: 0 }]
  }
  const s = d.nodeSize || 40
  if (isDecorShape(d.shape)) {
    const { w, h } = decorSize(d.shape, s)
    const hw = w / 2; const hh = h / 2
    return [{ x: 0, y: -hh - 5 }, { x: 0, y: hh + 5 }, { x: hw + 5, y: 0 }, { x: -hw - 5, y: 0 }]
  }
  switch (d.shape) {
    case 'rect': {
      const hw = s * 1.5; const hh = s
      return [{ x: 0, y: -hh - 5 }, { x: 0, y: hh + 5 }, { x: hw + 5, y: 0 }, { x: -hw - 5, y: 0 }]
    }
    case 'band': {
      const hw = (d.bandWidth || 200) / 2; const hh = (d.bandHeight || 30) / 2
      return [{ x: 0, y: -hh - 5 }, { x: 0, y: hh + 5 }, { x: hw + 5, y: 0 }, { x: -hw - 5, y: 0 }]
    }
    case 'ellipse':
      return [{ x: 0, y: -s - 5 }, { x: 0, y: s + 5 }, { x: s * 1.4 + 5, y: 0 }, { x: -s * 1.4 - 5, y: 0 }]
    case 'bubble': {
      const hw = s * 1.4; const hh = s * 0.9
      return [{ x: 0, y: -hh - 5 }, { x: 0, y: hh + 5 }, { x: hw + 5, y: 0 }, { x: -hw - 5, y: 0 }]
    }
    case 'tag': {
      const hw = s * 1.3; const hh = s
      return [{ x: 0, y: -hh - 5 }, { x: 0, y: hh + 5 }, { x: hw + 5, y: 0 }, { x: -hw - 5, y: 0 }]
    }
    default:   // circle, diamond, hexagon, star, shield, seal
      return [{ x: 0, y: -s - 5 }, { x: 0, y: s + 5 }, { x: s + 5, y: 0 }, { x: -s - 5, y: 0 }]
  }
}

function computeFamilyLayout(
  nodes: SimNode[],
  links: SimLink[],
  centerX = 600,
): Record<string, { x: number; y: number }> {
  const pcLinks = links.filter(l => l.type === 'parent-child')
  const childIds = new Set(pcLinks.map(l => l.target.id))
  const childrenMap = new Map<string, string[]>()
  for (const l of pcLinks) {
    if (!childrenMap.has(l.source.id)) childrenMap.set(l.source.id, [])
    childrenMap.get(l.source.id)!.push(l.target.id)
  }

  const genMap = new Map<string, number>()
  const roots = nodes.filter(n => n.type !== 'union' && !childIds.has(n.id))
  const queue: Array<{ id: string; gen: number }> = roots.map(r => ({ id: r.id, gen: 0 }))
  while (queue.length) {
    const { id, gen } = queue.shift()!
    if (genMap.has(id)) continue
    genMap.set(id, gen)
    for (const cid of (childrenMap.get(id) || [])) queue.push({ id: cid, gen: gen + 1 })
  }
  for (const n of nodes) {
    if (!genMap.has(n.id) && n.type !== 'union') genMap.set(n.id, 0)
  }

  const genGroups = new Map<number, string[]>()
  for (const [id, gen] of genMap) {
    if (!genGroups.has(gen)) genGroups.set(gen, [])
    genGroups.get(gen)!.push(id)
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const positions: Record<string, { x: number; y: number }> = {}

  for (const [gen, ids] of genGroups) {
    const sorted = [...ids].sort((a, b) => (nodeMap.get(a)?.x || 0) - (nodeMap.get(b)?.x || 0))
    const genY = gen * 160 + 100
    sorted.forEach((id, i) => {
      positions[id] = { x: centerX + (i - (sorted.length - 1) / 2) * 150, y: genY }
    })
  }

  const partnerLinks = links.filter(l => l.type === 'partner')
  for (const n of nodes) {
    if (n.type === 'union') {
      const partners = partnerLinks.filter(l => l.target.id === n.id)
      if (partners.length === 2) {
        const pos1 = positions[partners[0].source.id] || { x: partners[0].source.x, y: partners[0].source.y }
        const pos2 = positions[partners[1].source.id] || { x: partners[1].source.x, y: partners[1].source.y }
        positions[n.id] = { x: (pos1.x + pos2.x) / 2, y: (pos1.y + pos2.y) / 2 }
      }
    }
  }
  return positions
}

// All node ids in the same connected cluster as startId (edges treated as undirected)
function connectedComponent(startId: string, links: SimLink[]): string[] {
  const adj = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set())
    adj.get(a)!.add(b)
  }
  for (const l of links) { link(l.source.id, l.target.id); link(l.target.id, l.source.id) }
  const seen = new Set<string>([startId])
  const queue = [startId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const nb of adj.get(cur) ?? []) {
      if (!seen.has(nb)) { seen.add(nb); queue.push(nb) }
    }
  }
  return [...seen]
}

// ── component ─────────────────────────────────────────────────────────────────

export default function DynastyNetwork({
  persons,
  relationships,
  selectedNodeId,
  connectSourceId,
  connectMode: _connectMode,
  onNodeClick,
  onNodeCtrlClick,
  onEdgeClick,
  onConnectRequest,
  onAddPerson,
  onPositionChange,
  onBatchPositionChange,
  onNodeUpdate,
}: DynastyNetworkProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const linksRef = useRef<SimLink[]>([])
  const nodePositionsRef = useRef(new Map<string, { x: number; y: number }>())
  const draggingRef = useRef(false)
  const connectModeRef = useRef({ active: false, sourceId: '' })
  const currentTransform = useRef(d3.zoomIdentity)
  const initialZoomApplied = useRef(false)

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [gridSize, setGridSize] = useState(20)
  const [showGrid, setShowGrid] = useState(true)

  const handleZoomIn = useCallback(() => {
    if (svgRef.current && zoomRef.current)
      d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, 1.2)
  }, [])

  const handleZoomOut = useCallback(() => {
    if (svgRef.current && zoomRef.current)
      d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, 0.8)
  }, [])

  // Fit-to-content transform: scale + center the nodes' bounding box in the viewport
  // (replaces the old fixed width/5, height/5 offset that left a big empty top-left gap).
  const computeFit = useCallback((vw: number, vh: number): d3.ZoomTransform => {
    const nodes = nodesRef.current
    if (!nodes.length || vw === 0 || vh === 0) return d3.zoomIdentity
    const pad = 80
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      const r = getNodeRadius(n) + 30
      minX = Math.min(minX, n.x - r); minY = Math.min(minY, n.y - r)
      maxX = Math.max(maxX, n.x + r); maxY = Math.max(maxY, n.y + r)
    }
    const cw = Math.max(1, maxX - minX), ch = Math.max(1, maxY - minY)
    // Only shrink to fit when content is larger than the viewport; never enlarge.
    const scale = Math.min(1, Math.max(0.15, Math.min((vw - 2 * pad) / cw, (vh - 2 * pad) / ch)))
    // Anchor the content's top-left near the viewport's top-left (small margin) so there's no big gap.
    const tx = pad - minX * scale
    const ty = pad - minY * scale
    return d3.zoomIdentity.translate(tx, ty).scale(scale)
  }, [])

  const handleResetZoom = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      const t = computeFit(dimensions.width, dimensions.height)
      d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.transform, t)
    }
  }, [dimensions, computeFit])

  const handleAutoLayout = useCallback(() => {
    if (!simulationRef.current) return
    const positions = computeFamilyLayout(nodesRef.current, linksRef.current)
    onBatchPositionChange(positions)
    for (const n of nodesRef.current) {
      const pos = positions[n.id]
      if (pos) { n.x = pos.x; n.y = pos.y; n.fx = pos.x; n.fy = pos.y }
    }
    simulationRef.current.alpha(0.3).restart()
  }, [onBatchPositionChange])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(() =>
      setDimensions({ width: el.clientWidth, height: el.clientHeight })
    )
    obs.observe(el)
    setDimensions({ width: el.clientWidth, height: el.clientHeight })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const pos = new Map<string, { x: number; y: number }>()
    for (const p of persons) {
      if (p.x != null && p.y != null) pos.set(p.id, { x: p.x!, y: p.y! })
    }
    nodePositionsRef.current = pos
  }, [persons])

  useEffect(() => () => { simulationRef.current?.stop() }, [])

  // ── main D3 effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !persons.length || dimensions.width === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const container = svg.append('g').attr('class', 'zoom-container')
    const defs = svg.append('defs')
    ensureShapeArtDefs(defs as any)

    // Arrow marker
    defs.append('marker').attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10').attr('refX', 8).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#94a3b8')

    // Dot markers
    for (const [id, color] of [['marriage-dot', '#f97316'], ['partner-dot', '#f97316']] as const) {
      defs.append('marker').attr('id', id)
        .attr('viewBox', '-4 -4 8 8').attr('refX', 0).attr('refY', 0)
        .attr('markerWidth', 8).attr('markerHeight', 8)
        .append('circle').attr('r', 3).attr('fill', color)
    }

    defs.append('marker').attr('id', 'succession-circle')
      .attr('viewBox', '-5 -5 10 10').attr('refX', 0).attr('refY', 0)
      .attr('markerWidth', 8).attr('markerHeight', 8)
      .append('circle').attr('r', 4).attr('fill', 'none').attr('stroke', '#10b981').attr('stroke-width', 2)

    defs.append('marker').attr('id', 'sibling-square')
      .attr('viewBox', '-4 -4 8 8').attr('refX', 0).attr('refY', 0)
      .attr('markerWidth', 8).attr('markerHeight', 8)
      .append('rect').attr('x', -3).attr('y', -3).attr('width', 6).attr('height', 6).attr('fill', '#8b5cf6')

    // Build nodes / links
    const fallX = dimensions.width / 5
    const fallY = dimensions.height / 5

    const nodes: SimNode[] = persons.map(p => {
      const s = nodePositionsRef.current.get(p.id)
      return { ...p, x: s?.x ?? p.x ?? fallX, y: s?.y ?? p.y ?? fallY }
    })
    nodesRef.current = nodes
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    const links: SimLink[] = relationships
      .map(r => ({ ...r, source: nodeMap.get(r.source)!, target: nodeMap.get(r.target)! }))
      .filter(l => l.source && l.target)
    linksRef.current = links

    // Clip paths (shape-specific for image masking)
    defs.selectAll('.nc').data(nodes).enter()
      .append('clipPath').attr('id', d => `clip-${d.id}`).attr('class', 'nc')
      .each(function(d) {
        const cp = d3.select(this)
        const s = d.type === 'union' ? 12 : (d.nodeSize || 40)
        const shape = d.type === 'union' ? 'circle' : (d.shape || 'circle')
        if (isDecorShape(d.shape)) {
          const { w, h } = decorSize(d.shape, s)
          cp.append('rect').attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h).attr('rx', 10 * (s / 40))
        } else if (shape === 'rect') {
          cp.append('rect').attr('x', -s * 1.5).attr('y', -s).attr('width', s * 3).attr('height', s * 2).attr('rx', 8)
        } else if (shape === 'diamond') {
          cp.append('path').attr('d', `M 0 ${-s} L ${s} 0 L 0 ${s} L ${-s} 0 Z`)
        } else if (shape === 'hexagon') {
          cp.append('polygon').attr('points', hexPoints(s))
        } else if (shape === 'band') {
          const bw = d.bandWidth || 200; const bh = d.bandHeight || 30
          cp.append('rect').attr('x', -bw / 2).attr('y', -bh / 2).attr('width', bw).attr('height', bh).attr('rx', 4)
        } else if (shape === 'ellipse') {
          cp.append('ellipse').attr('rx', s * 1.4).attr('ry', s)
        } else if (shape === 'star') {
          cp.append('polygon').attr('points', starPoints(s))
        } else if (shape === 'shield') {
          cp.append('path').attr('d', shieldPath(s))
        } else if (shape === 'bubble') {
          cp.append('rect').attr('x', -s * 1.4).attr('y', -s * 0.9).attr('width', s * 2.8).attr('height', s * 1.8).attr('rx', Math.min(s * 1.4, s * 0.9) * 0.3)
        } else if (shape === 'tag') {
          cp.append('path').attr('d', tagPath(s * 1.3, s))
        } else if (shape === 'seal') {
          cp.append('circle').attr('r', s * 0.82)
        } else {
          cp.append('circle').attr('r', s)
        }
      })

    // Grid
    if (showGrid) {
      const gw = dimensions.width * 2; const gh = dimensions.height * 2
      const grid = container.append('g').attr('class', 'grid')
      for (let y = 0; y <= gh; y += gridSize)
        grid.append('line').attr('x1', 0).attr('y1', y).attr('x2', gw).attr('y2', y)
          .attr('stroke', '#e5e7eb').attr('stroke-width', 0.5)
      for (let x = 0; x <= gw; x += gridSize)
        grid.append('line').attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', gh)
          .attr('stroke', '#e5e7eb').attr('stroke-width', 0.5)
    }

    // Simulation
    const simulation = d3.forceSimulation<SimNode, SimLink>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('x', d3.forceX().strength(0.05))
      .force('y', d3.forceY().strength(0.05))
      .force('marriage', () => {
        for (const n of nodes) {
          if (n.type !== 'union') continue
          const partners = links.filter(l => l.target.id === n.id && l.type === 'partner')
          if (partners.length === 2) {
            const mx = (partners[0].source.x + partners[1].source.x) / 2
            const my = (partners[0].source.y + partners[1].source.y) / 2
            n.x += (mx - n.x) * 0.2
            n.y += (my - n.y) * 0.2
          }
        }
      })
    simulationRef.current = simulation

    const snapToGrid = (v: number) => showGrid ? Math.round(v / gridSize) * gridSize : v

    // Preview line for connect mode
    const previewLine = container.append('line')
      .attr('stroke', '#3b82f6').attr('stroke-width', 2)
      .attr('stroke-dasharray', '6,3').attr('pointer-events', 'none')
      .style('display', 'none')

    // Build parallel-edge groups so we can fan curves when multiple edges share the same pair
    const edgeKey = (a: string, b: string) => [a, b].sort().join('\x00')
    const edgeGroups = new Map<string, SimLink[]>()
    for (const l of links) {
      const key = edgeKey(l.source.id, l.target.id)
      if (!edgeGroups.has(key)) edgeGroups.set(key, [])
      edgeGroups.get(key)!.push(l)
    }
    // Index within group: 0 = straight, ±1 = left/right, etc.
    const edgeCurveIndex = new Map<string, number>()
    for (const group of edgeGroups.values()) {
      group.forEach((l, i) => edgeCurveIndex.set(l.id, i - Math.floor(group.length / 2)))
    }

    const edgeColor = (d: SimLink): string => d.color || (
      d.type === 'marriage'     ? '#f97316' :
      d.type === 'remarriage'   ? '#d946ef' :
      d.type === 'partner'      ? '#f97316' :
      d.type === 'parent-child' ? '#3b82f6' :
      d.type === 'succession'   ? '#10b981' :
      d.type === 'sibling'      ? '#8b5cf6' :
      d.type === 'ally'         ? '#0ea5e9' :
      d.type === 'rival'        ? '#f43f5e' :
      d.type === 'mentor'       ? '#d97706' :
      d.type === 'enemy'        ? '#dc2626' :
      d.type === 'friend'       ? '#22c55e' : '#94a3b8'
    )

    // Links — use <path> so quadratic bezier curves work
    const linkSel = container.append('g').attr('class', 'links')
      .selectAll<SVGPathElement, SimLink>('path')
      .data(links).enter().append('path')
      .attr('fill', 'none')
      .attr('stroke', edgeColor)
      .attr('stroke-width', d => d.width || (d.type === 'sibling' ? 1.5 : 2))
      .attr('stroke-dasharray', d =>
        d.type === 'marriage'   ? '5,5' :
        d.type === 'remarriage' ? '8,3,2,3' :
        d.type === 'enemy'      ? '4,3' :
        d.type === 'rival'      ? '6,2' : '0'
      )
      .attr('marker-end', d => {
        if (d.type === 'parent-child') return 'url(#arrow)'
        if (d.type === 'marriage' || d.type === 'remarriage') return 'url(#marriage-dot)'
        if (d.type === 'succession') return 'url(#succession-circle)'
        if (d.type === 'sibling') return 'url(#sibling-square)'
        if (d.type === 'partner') return 'url(#partner-dot)'
        return null
      })
      .style('cursor', 'pointer')
      .on('mouseover', function() { d3.select(this).attr('stroke-width', 4) })
      .on('mouseout', function(_, d) { d3.select(this).attr('stroke-width', d.width || (d.type === 'sibling' ? 1.5 : 2)) })
      .on('mousedown pointerdown', function(event) { event.stopPropagation() })
      .on('click', function(event, d) {
        event.stopPropagation()
        onEdgeClick({ ...d, source: d.source.id, target: d.target.id }, event.clientX, event.clientY)
      })

    // Node drag — filter overridden so Ctrl/Cmd+click passes through (d3 ignores it by default)
    // Shift+drag moves the whole connected cluster (relative positions preserved).
    let cluster: { ids: string[]; orig: Map<string, { x: number; y: number }> } | null = null
    const drag = d3.drag<SVGGElement, SimNode>()
      .filter((event) => !event.button)
      .on('start', function(event, d) {
        draggingRef.current = false
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x; d.fy = d.y
        cluster = null
        if ((event.sourceEvent as MouseEvent | undefined)?.shiftKey) {
          const ids = connectedComponent(d.id, linksRef.current)
          const orig = new Map<string, { x: number; y: number }>()
          for (const id of ids) {
            const n = nodesRef.current.find((nn) => nn.id === id)
            if (n) { orig.set(id, { x: n.x, y: n.y }); n.fx = n.x; n.fy = n.y }
          }
          cluster = { ids, orig }
        }
      })
      .on('drag', function(event, d) {
        draggingRef.current = true
        if (cluster) {
          const a = cluster.orig.get(d.id)
          const dx = event.x - (a?.x ?? event.x)
          const dy = event.y - (a?.y ?? event.y)
          for (const id of cluster.ids) {
            const n = nodesRef.current.find((nn) => nn.id === id)
            const o = cluster.orig.get(id)
            if (n && o) {
              n.fx = o.x + dx; n.fy = o.y + dy
              nodePositionsRef.current.set(id, { x: o.x + dx, y: o.y + dy })
            }
          }
        } else {
          d.fx = event.x; d.fy = event.y
          nodePositionsRef.current.set(d.id, { x: event.x, y: event.y })
        }
      })
      .on('end', function(event, d) {
        const se = event.sourceEvent as MouseEvent | undefined
        if (draggingRef.current) {
          if (!event.active) simulation.alphaTarget(0)
          if (cluster) {
            const batch: Record<string, { x: number; y: number }> = {}
            for (const id of cluster.ids) {
              const n = nodesRef.current.find((nn) => nn.id === id)
              if (n) { n.fx = n.x = n.fx ?? n.x; n.fy = n.y = n.fy ?? n.y; batch[id] = { x: n.x, y: n.y } }
            }
            onBatchPositionChange(batch)
          } else {
            d.fx = d.x; d.fy = d.y
            nodePositionsRef.current.set(d.id, { x: d.x, y: d.y })
            onPositionChange(d.id, d.x, d.y)
          }
          cluster = null
        } else if (se && (se.ctrlKey || se.metaKey) && onNodeCtrlClick) {
          onNodeCtrlClick(d.id, se.clientX ?? 0, se.clientY ?? 0)
        } else {
          const sx = se?.clientX ?? 0
          const sy = se?.clientY ?? 0
          onNodeClick(d, sx, sy)
        }
        draggingRef.current = false
      })

    // Node groups
    const nodeSel = container.append('g').attr('class', 'nodes')
      .selectAll<SVGGElement, SimNode>('g.node-group')
      .data(nodes).enter()
      .append('g').attr('class', 'node-group')
      .style('cursor', 'pointer')
      .call(drag)

    // Centered name drawn ON the shape (all shapes). halfW = half-width used for the readable band.
    const drawCenteredName = (g: d3.Selection<SVGGElement, unknown, null, undefined>, d: SimNode, halfW: number) => {
      const fsz = d.labelFontSize || 12
      const weight = d.labelBold === false ? 'normal' : 'bold'
      const nameG = g.append('g').attr('class', 'node-inline-label').attr('pointer-events', 'none')
      // Background is transparent by default; a band is drawn only when Label Background is set.
      if (d.labelBgShape && d.labelBgColor) {
        nameG.append('rect')
          .attr('x', -halfW).attr('y', -fsz).attr('width', halfW * 2).attr('height', fsz * 2)
          .attr('rx', d.labelBgShape === 'pill' ? 999 : 4)
          .attr('fill', d.labelBgColor).attr('opacity', 0.85)
      }
      // A subtle halo keeps the text readable over images / any fill without an opaque background.
      nameG.append('text')
        .attr('text-anchor', 'middle').attr('dy', '0.35em')
        .attr('font-size', fsz).attr('font-weight', weight)
        .attr('fill', d.labelColor || '#fff')
        .attr('font-family', d.fontFamily || 'sans-serif')
        .style('paint-order', 'stroke')
        .style('stroke', 'rgba(0,0,0,0.35)')
        .style('stroke-width', d.image ? '3px' : '2px')
        .style('stroke-linejoin', 'round')
        .text(d.name || 'Unknown')
    }

    // Draw shapes + selection rings + port handles
    nodeSel.each(function(d) {
      const g = d3.select(this)
      const shape = d.type === 'union' ? 'union' : (d.shape || 'circle')
      const s = d.nodeSize || 40
      const fill = nodeFill(d)
      const stroke = nodeStroke(d)
      const isSelected = selectedNodeId === d.id

      if (isDecorShape(d.shape)) {
        // Decorative Japanese/historical card. The shape is a themed FRAME:
        // when an image/video is set it fills the card; otherwise the reference artwork is shown.
        const { w, h } = decorSize(d.shape, s)
        const meta = decorMeta(d.shape)
        const rx = 10 * (s / 40)
        g.append('rect').attr('class', 'selection-ring')
          .attr('x', -w / 2 - 6).attr('y', -h / 2 - 6).attr('width', w + 12).attr('height', h + 12)
          .attr('rx', 14).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')

        if (d.image) {
          // transparent card + image fill + themed frame (form-only, per user's request)
          g.append('rect').attr('class', 'node-shape')
            .attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h).attr('rx', rx)
            .attr('fill', d.bgColor || '#fff').attr('stroke', meta.c2).attr('stroke-width', 3)
            .attr('filter', 'url(#paperShadow)')
          if (isVideoUrl(d.image)) {
            const fo = g.append('foreignObject')
              .attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h)
              .attr('clip-path', `url(#clip-${d.id})`)
            const video = fo.append('xhtml:video').attr('src', d.image)
              .attr('autoplay', 'true').attr('loop', 'true').attr('playsinline', 'true')
              .style('width', '100%').style('height', '100%').style('object-fit', 'cover')
            const vEl = video.node() as HTMLVideoElement | null
            if (vEl) { vEl.muted = true; vEl.play?.().catch(() => {}) }
          } else {
            g.append('image').attr('href', d.image)
              .attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h)
              .attr('preserveAspectRatio', 'xMidYMid slice')
              .attr('clip-path', `url(#clip-${d.id})`)
              .on('error', function() { d3.select(this).attr('href', null) })
          }
          // themed frame on top of the image
          g.append('rect')
            .attr('x', -w / 2).attr('y', -h / 2).attr('width', w).attr('height', h).attr('rx', rx)
            .attr('fill', 'none').attr('stroke', meta.c2).attr('stroke-width', 3)
        } else {
          drawShapeArt(g as any, d.shape, s)
        }
        const fs = d.labelFontSize || 13
        const tc = d.labelColor || '#3d3226'
        const ff = d.fontFamily || 'serif'
        const weight = d.labelBold === false ? 'normal' : 'bold'
        let ly = h / 2 + fs + 8
        g.append('text').attr('class', 'node-inline-label').attr('text-anchor', 'middle').attr('y', ly)
          .attr('font-size', fs).attr('font-weight', weight).attr('fill', tc).attr('font-family', ff)
          .attr('pointer-events', 'none').text(d.name || 'Unknown')
        ly += fs * 1.3
        if (d.title) {
          g.append('text').attr('text-anchor', 'middle').attr('y', ly)
            .attr('font-size', fs * 0.8).attr('fill', tc).attr('font-family', ff)
            .attr('pointer-events', 'none').text(d.title)
          ly += fs * 1.1
        }
        let lifespan = ''
        if (d.birth && d.death) lifespan = `${d.birth} – ${d.death}`
        else if (d.birth) lifespan = d.birth
        else if (d.age) lifespan = d.age
        if (lifespan) {
          g.append('text').attr('text-anchor', 'middle').attr('y', ly)
            .attr('font-size', fs * 0.75).attr('fill', tc).attr('font-family', ff)
            .attr('pointer-events', 'none').text(lifespan)
        }
      } else if (isPortraitShape(d.shape)) {
        // Circular portrait: photo fills a circle, themed ornamental frame on top, name below.
        const pm = portraitMeta(d.shape)
        g.append('circle').attr('class', 'selection-ring')
          .attr('r', s + 6).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        g.append('circle').attr('class', 'node-shape').attr('r', s).attr('fill', d.bgColor || '#fff')
        if (d.image && isVideoUrl(d.image)) {
          const fo = g.append('foreignObject')
            .attr('x', -s).attr('y', -s).attr('width', s * 2).attr('height', s * 2)
            .attr('clip-path', `url(#clip-${d.id})`)
          const video = fo.append('xhtml:video').attr('src', d.image)
            .attr('autoplay', 'true').attr('loop', 'true').attr('playsinline', 'true')
            .style('width', '100%').style('height', '100%').style('object-fit', 'cover')
          const vEl = video.node() as HTMLVideoElement | null
          if (vEl) { vEl.muted = true; vEl.play?.().catch(() => {}) }
        } else if (d.image) {
          g.append('image').attr('href', d.image)
            .attr('x', -s).attr('y', -s).attr('width', s * 2).attr('height', s * 2)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', `url(#clip-${d.id})`)
            .on('error', function() { d3.select(this).attr('href', null) })
        } else {
          const sil = g.append('g').attr('clip-path', `url(#clip-${d.id})`)
          drawPersonSilhouette(sil as any, s, pm.fill)
        }
        drawPortraitFrame(g as any, d.shape, s)
        const fs = d.labelFontSize || 13
        const tc = d.labelColor || '#334155'
        const ff = d.fontFamily || 'sans-serif'
        const weight = d.labelBold === false ? 'normal' : 'bold'
        let ly = s + fs + 10
        g.append('text').attr('class', 'node-inline-label').attr('text-anchor', 'middle').attr('y', ly)
          .attr('font-size', fs).attr('font-weight', weight).attr('fill', tc).attr('font-family', ff)
          .attr('pointer-events', 'none').text(d.name || 'Unknown')
        ly += fs * 1.3
        if (d.title) {
          g.append('text').attr('text-anchor', 'middle').attr('y', ly)
            .attr('font-size', fs * 0.8).attr('fill', tc).attr('font-family', ff)
            .attr('pointer-events', 'none').text(d.title)
          ly += fs * 1.1
        }
        let lifespan = ''
        if (d.birth && d.death) lifespan = `${d.birth} – ${d.death}`
        else if (d.birth) lifespan = d.birth
        else if (d.age) lifespan = d.age
        if (lifespan) {
          g.append('text').attr('text-anchor', 'middle').attr('y', ly)
            .attr('font-size', fs * 0.75).attr('fill', tc).attr('font-family', ff)
            .attr('pointer-events', 'none').text(lifespan)
        }
      } else if (shape === 'union') {
        g.append('circle').attr('class', 'selection-ring')
          .attr('r', 18).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        g.append('circle').attr('class', 'node-shape')
          .attr('r', 12).attr('fill', '#f97316').attr('stroke', '#c2410c').attr('stroke-width', 2)
      } else if (shape === 'circle') {
        g.append('circle').attr('class', 'selection-ring')
          .attr('r', s + 5).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        g.append('circle').attr('class', 'node-shape')
          .attr('r', s).attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 2)
        if (d.image && isVideoUrl(d.image)) {
          const fo = g.append('foreignObject')
            .attr('x', -s).attr('y', -s).attr('width', s * 2).attr('height', s * 2)
            .attr('clip-path', `url(#clip-${d.id})`)
          const video = fo.append('xhtml:video')
            .attr('src', d.image)
            .attr('autoplay', 'true').attr('loop', 'true').attr('playsinline', 'true')
            .style('width', '100%').style('height', '100%').style('object-fit', 'cover')
          const vEl = video.node() as HTMLVideoElement | null
          if (vEl) { vEl.muted = true; vEl.play?.().catch(() => {}) }
        } else if (d.image) {
          g.append('image')
            .attr('href', d.image)
            .attr('x', -s).attr('y', -s).attr('width', s * 2).attr('height', s * 2)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', `url(#clip-${d.id})`)
            .on('error', function() { d3.select(this).attr('href', null) })
        }
        drawCenteredName(g as any, d, s)
      } else if (shape === 'rect') {
        const hw = s * 1.5; const hh = s
        g.append('rect').attr('class', 'selection-ring')
          .attr('x', -hw - 4).attr('y', -hh - 4)
          .attr('width', (hw + 4) * 2).attr('height', (hh + 4) * 2)
          .attr('rx', 10).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        g.append('rect').attr('class', 'node-shape')
          .attr('x', -hw).attr('y', -hh).attr('width', hw * 2).attr('height', hh * 2)
          .attr('rx', 8).attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 2)
        if (d.image) {
          g.append('image').attr('href', d.image)
            .attr('x', -hw).attr('y', -hh).attr('width', hw * 2).attr('height', hh * 2)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', `url(#clip-${d.id})`)
            .on('error', function() { d3.select(this).attr('href', null) })
        }
        drawCenteredName(g as any, d, hw)
      } else if (shape === 'diamond') {
        g.append('circle').attr('class', 'selection-ring')
          .attr('r', s + 5).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        g.append('path').attr('class', 'node-shape')
          .attr('d', `M 0 ${-s} L ${s} 0 L 0 ${s} L ${-s} 0 Z`)
          .attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 2)
        if (d.image) {
          g.append('image').attr('href', d.image)
            .attr('x', -s).attr('y', -s).attr('width', s * 2).attr('height', s * 2)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', `url(#clip-${d.id})`)
            .on('error', function() { d3.select(this).attr('href', null) })
        }
        drawCenteredName(g as any, d, s)
      } else if (shape === 'hexagon') {
        g.append('circle').attr('class', 'selection-ring')
          .attr('r', s + 5).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        g.append('polygon').attr('class', 'node-shape')
          .attr('points', hexPoints(s))
          .attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 2)
        if (d.image) {
          g.append('image').attr('href', d.image)
            .attr('x', -s).attr('y', -s).attr('width', s * 2).attr('height', s * 2)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', `url(#clip-${d.id})`)
            .on('error', function() { d3.select(this).attr('href', null) })
        }
        drawCenteredName(g as any, d, s)
      } else if (shape === 'band') {
        const bw = d.bandWidth || 200; const bh = d.bandHeight || 30
        g.append('rect').attr('class', 'selection-ring')
          .attr('x', -bw / 2 - 4).attr('y', -bh / 2 - 4)
          .attr('width', bw + 8).attr('height', bh + 8)
          .attr('rx', 6).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        g.append('rect').attr('class', 'node-shape')
          .attr('x', -bw / 2).attr('y', -bh / 2).attr('width', bw).attr('height', bh)
          .attr('rx', 4).attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 2)
        if (d.image) {
          g.append('image').attr('href', d.image)
            .attr('x', -bw / 2).attr('y', -bh / 2).attr('width', bw).attr('height', bh)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', `url(#clip-${d.id})`)
            .on('error', function() { d3.select(this).attr('href', null) })
        }
        drawCenteredName(g as any, d, bw / 2)
      } else if (shape === 'ellipse') {
        g.append('ellipse').attr('class', 'selection-ring')
          .attr('rx', s * 1.4 + 5).attr('ry', s + 5)
          .attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        g.append('ellipse').attr('class', 'node-shape')
          .attr('rx', s * 1.4).attr('ry', s)
          .attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 2)
        if (d.image) {
          g.append('image').attr('href', d.image)
            .attr('x', -s * 1.4).attr('y', -s).attr('width', s * 2.8).attr('height', s * 2)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', `url(#clip-${d.id})`)
            .on('error', function() { d3.select(this).attr('href', null) })
        }
        drawCenteredName(g as any, d, s * 1.4)
      } else if (shape === 'star') {
        g.append('circle').attr('class', 'selection-ring')
          .attr('r', s + 5).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        g.append('polygon').attr('class', 'node-shape')
          .attr('points', starPoints(s))
          .attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 2).attr('stroke-linejoin', 'round')
        if (d.image) {
          g.append('image').attr('href', d.image)
            .attr('x', -s).attr('y', -s).attr('width', s * 2).attr('height', s * 2)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', `url(#clip-${d.id})`)
            .on('error', function() { d3.select(this).attr('href', null) })
        }
        drawCenteredName(g as any, d, s * 0.7)
      } else if (shape === 'shield') {
        g.append('circle').attr('class', 'selection-ring')
          .attr('r', s + 5).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        g.append('path').attr('class', 'node-shape')
          .attr('d', shieldPath(s))
          .attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 2).attr('stroke-linejoin', 'round')
        if (d.image) {
          g.append('image').attr('href', d.image)
            .attr('x', -s).attr('y', -s).attr('width', s * 2).attr('height', s * 2)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', `url(#clip-${d.id})`)
            .on('error', function() { d3.select(this).attr('href', null) })
        }
        drawCenteredName(g as any, d, s)
      } else if (shape === 'bubble') {
        const hw = s * 1.4; const hh = s * 0.9
        g.append('path').attr('class', 'selection-ring')
          .attr('d', bubblePath(hw + 4, hh + 4))
          .attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        g.append('path').attr('class', 'node-shape')
          .attr('d', bubblePath(hw, hh))
          .attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 2).attr('stroke-linejoin', 'round')
        if (d.image) {
          g.append('image').attr('href', d.image)
            .attr('x', -hw).attr('y', -hh).attr('width', hw * 2).attr('height', hh * 2)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', `url(#clip-${d.id})`)
            .on('error', function() { d3.select(this).attr('href', null) })
        }
        drawCenteredName(g as any, d, hw)
      } else if (shape === 'tag') {
        const hw = s * 1.3; const hh = s
        g.append('path').attr('class', 'selection-ring')
          .attr('d', tagPath(hw + 4, hh + 4))
          .attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        g.append('path').attr('class', 'node-shape')
          .attr('d', tagPath(hw, hh))
          .attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 2).attr('stroke-linejoin', 'round')
        // punch hole (label eyelet)
        g.append('circle').attr('cx', hw - hh * 0.28).attr('cy', -hh + hh * 0.28).attr('r', hh * 0.1)
          .attr('fill', '#fff').attr('opacity', 0.8)
        if (d.image) {
          g.append('image').attr('href', d.image)
            .attr('x', -hw).attr('y', -hh).attr('width', hw * 2).attr('height', hh * 2)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', `url(#clip-${d.id})`)
            .on('error', function() { d3.select(this).attr('href', null) })
        }
        drawCenteredName(g as any, d, hw)
      } else if (shape === 'seal') {
        g.append('circle').attr('class', 'selection-ring')
          .attr('r', s + 5).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 3)
          .style('display', isSelected ? null : 'none')
        // double-ring stamp
        g.append('circle').attr('class', 'node-shape')
          .attr('r', s).attr('fill', fill).attr('stroke', stroke).attr('stroke-width', 3)
        g.append('circle')
          .attr('r', s * 0.82).attr('fill', 'none').attr('stroke', stroke).attr('stroke-width', 1.5).attr('opacity', 0.7)
        if (d.image) {
          g.append('image').attr('href', d.image)
            .attr('x', -s * 0.82).attr('y', -s * 0.82).attr('width', s * 1.64).attr('height', s * 1.64)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('clip-path', `url(#clip-${d.id})`)
            .on('error', function() { d3.select(this).attr('href', null) })
        }
        drawCenteredName(g as any, d, s * 0.7)
      }

      // Port handles
      // Ctrl-click connect-source highlight ring (green), toggled via effect
      g.append('circle').attr('class', 'connect-ring')
        .attr('r', getNodeRadius(d) + 8).attr('fill', 'none')
        .attr('stroke', '#22c55e').attr('stroke-width', 3).attr('stroke-dasharray', '5,3')
        .style('display', connectSourceId === d.id ? null : 'none')

      const portG = g.append('g').attr('class', 'port-handles').style('display', 'none')
      for (const p of getPortPositions(d)) {
        portG.append('circle').attr('class', 'port-handle')
          .attr('cx', p.x).attr('cy', p.y).attr('r', 9)
          .attr('fill', '#3b82f6').attr('stroke', 'white').attr('stroke-width', 2)
          .style('cursor', 'crosshair')
      }
    })

    // Port hover show/hide
    nodeSel
      .on('mouseover.ports', function(_, d) {
        if (!connectModeRef.current.active)
          d3.select(this).select('.port-handles').style('display', null)
      })
      .on('mouseout.ports', function(_, d) {
        const cm = connectModeRef.current
        if (!cm.active || cm.sourceId !== d.id)
          d3.select(this).select('.port-handles').style('display', 'none')
      })

    // Port drag (connect mode)
    const portDrag = d3.drag<SVGCircleElement, unknown>()
      .on('start', function(event) {
        event.sourceEvent.stopPropagation()
        const nodeEl = (this as SVGElement).closest('.node-group')
        if (!nodeEl) return
        const nd = d3.select<SVGGElement, SimNode>(nodeEl as SVGGElement).datum()
        connectModeRef.current = { active: true, sourceId: nd.id }
        previewLine.attr('x1', nd.x).attr('y1', nd.y).attr('x2', nd.x).attr('y2', nd.y)
          .style('display', null)
      })
      .on('drag', function(event) {
        const src = nodesRef.current.find(n => n.id === connectModeRef.current.sourceId)
        if (!src) return
        const [mx, my] = d3.pointer(event.sourceEvent, container.node())
        previewLine.attr('x1', src.x).attr('y1', src.y).attr('x2', mx).attr('y2', my)
        nodeSel.select('.node-shape')
          .attr('opacity', (d: SimNode) => d.id === connectModeRef.current.sourceId ? 1 : 0.7)
      })
      .on('end', function(event) {
        const [mx, my] = d3.pointer(event.sourceEvent, container.node())
        const sourceId = connectModeRef.current.sourceId
        let target: SimNode | null = null
        let minDist = Infinity

        for (const n of nodesRef.current) {
          if (n.id === sourceId) continue
          const dist = Math.hypot(n.x - mx, n.y - my)
          const threshold = getNodeRadius(n) + 10
          if (dist <= threshold && dist < minDist) { minDist = dist; target = n }
        }

        if (target) onConnectRequest(sourceId, target.id)

        connectModeRef.current = { active: false, sourceId: '' }
        previewLine.style('display', 'none')
        nodeSel.select('.node-shape').attr('opacity', 1)
        nodeSel.select('.port-handles').style('display', 'none')
      })

    nodeSel.selectAll<SVGCircleElement, unknown>('.port-handle').call(portDrag)

    // ── Label / description offset maps ─────────────────────────────────────────
    const lblOffMap = new Map<string, { x: number; y: number }>()
    for (const nd of nodes) {
      if (nd.labelOffsetX != null || nd.labelOffsetY != null) {
        lblOffMap.set(nd.id, { x: nd.labelOffsetX ?? 0, y: nd.labelOffsetY ?? 0 })
      } else {
        const s2 = nd.type === 'union' ? 12 : (nd.nodeSize || 40)
        const fs2 = nd.labelFontSize || 12
        const shape2 = nd.type === 'union' ? 'union' : (nd.shape || 'circle')
        if (shape2 === 'rect') {
          lblOffMap.set(nd.id, { x: 0, y: s2 + 15 + fs2 * 0.5 })
        } else if (shape2 === 'band') {
          lblOffMap.set(nd.id, { x: 0, y: (nd.bandHeight || 30) / 2 + 12 + fs2 * 0.5 })
        } else {
          const lp2 = nd.labelPosition || 'above'
          const defs2: Record<string, { x: number; y: number }> = {
            above:  { x: 0,           y: -(s2 + fs2 + 8) },
            below:  { x: 0,           y: s2 + fs2 * 0.5 + 12 },
            left:   { x: -(s2 + fs2 * 3), y: 0 },
            right:  { x: s2 + fs2 * 3,    y: 0 },
            inside: { x: 0,           y: 0 },
          }
          lblOffMap.set(nd.id, defs2[lp2] ?? defs2.above)
        }
      }
    }

    const descOffMap = new Map<string, { x: number; y: number }>()
    for (const nd of nodes) {
      if (!nd.description) continue
      if (nd.descriptionOffsetX != null || nd.descriptionOffsetY != null) {
        descOffMap.set(nd.id, { x: nd.descriptionOffsetX ?? 0, y: nd.descriptionOffsetY ?? 0 })
      } else {
        const s2 = nd.type === 'union' ? 12 : (nd.nodeSize || 40)
        const pos2 = nd.descriptionPosition || 'below'
        descOffMap.set(nd.id, pos2 === 'below' ? { x: 0, y: s2 + 40 } : { x: s2 + 20, y: -s2 })
      }
    }

    // ── Label drag ───────────────────────────────────────────────────────────────
    const lblDrag = d3.drag<SVGGElement, SimNode>()
      .on('start', function(event) {
        event.sourceEvent.stopPropagation()
        d3.select(this).style('cursor', 'grabbing')
      })
      .on('drag', function(event, d) {
        const off = lblOffMap.get(d.id) ?? { x: 0, y: 0 }
        const newOff = { x: off.x + event.dx, y: off.y + event.dy }
        lblOffMap.set(d.id, newOff)
        const parentG = this.parentNode as SVGGElement
        d3.select(parentG).attr('transform',
          `translate(${snapToGrid(d.x + newOff.x)},${snapToGrid(d.y + newOff.y)})`)
      })
      .on('end', function(_, d) {
        d3.select(this).style('cursor', 'grab')
        const off = lblOffMap.get(d.id)!
        onNodeUpdate?.(d.id, { labelOffsetX: off.x, labelOffsetY: off.y })
      })

    // ── Description drag ─────────────────────────────────────────────────────────
    const descDrag = d3.drag<SVGGElement, SimNode>()
      .on('start', function(event) {
        event.sourceEvent.stopPropagation()
        d3.select(this).style('cursor', 'grabbing')
      })
      .on('drag', function(event, d) {
        const off = descOffMap.get(d.id) ?? { x: 0, y: 0 }
        const newOff = { x: off.x + event.dx, y: off.y + event.dy }
        descOffMap.set(d.id, newOff)
        d3.select(this).attr('transform',
          `translate(${snapToGrid(d.x + newOff.x)},${snapToGrid(d.y + newOff.y)})`)
      })
      .on('end', function(_, d) {
        d3.select(this).style('cursor', 'grab')
        const off = descOffMap.get(d.id)!
        onNodeUpdate?.(d.id, { descriptionOffsetX: off.x, descriptionOffsetY: off.y })
      })

    // ── Labels ──────────────────────────────────────────────────────────────────
    const labelGroup = container.append('g').attr('class', 'labels')
    const labelSel = labelGroup.selectAll<SVGGElement, SimNode>('g.node-label')
      .data(nodes).enter()
      .append('g').attr('class', 'node-label').attr('pointer-events', 'none')

    labelSel.each(function(d) {
      // Decorative & portrait shapes draw their own name/title/lifespan inside the node group.
      if (isDecorShape(d.shape) || isPortraitShape(d.shape)) return
      const label = d3.select(this)
      const shape = d.type === 'union' ? 'union' : (d.shape || 'circle')
      const s = d.type === 'union' ? 12 : (d.nodeSize || 40)
      const fs = d.labelFontSize || 12
      const tc = d.labelColor || '#334155'
      const ff = d.fontFamily || 'sans-serif'

      if (shape === 'union') {
        const txt = label.append('text').attr('text-anchor', 'middle').attr('y', 20)
          .attr('font-size', fs).attr('fill', '#f97316').attr('font-family', ff)
        const UNION_LABEL: Record<string, string> = {
          'marriage': '結婚', 'remarriage': '再婚', 'sibling': '兄弟姉妹',
          'parent-child': '親子', 'succession': '継承', 'friend': '親友',
          'ally': '同盟', 'mentor': '師弟', 'rival': '対立', 'enemy': '敵対', 'custom': '',
        }
        const utype = UNION_LABEL[d.marriage?.type ?? 'marriage'] ?? '結婚'
        txt.append('tspan').text(d.marriage?.label || utype).attr('x', 0).attr('dy', 0)
        if (d.marriage?.start || d.marriage?.end) {
          txt.append('tspan')
            .text(`(${d.marriage?.start || '?'} - ${d.marriage?.end || '?'})`)
            .attr('x', 0).attr('dy', '1.2em')
        }
        return
      }

      // rect/band: lifespan + title below shape (name is inline in shape)
      if (shape === 'rect' || shape === 'band') {
        let lineY = 0
        let lifespan = ''
        if (d.birth && d.death) lifespan = `${d.birth} – ${d.death}`
        else if (d.birth) lifespan = d.birth
        else if (d.age) lifespan = d.age
        if (lifespan) {
          label.append('text').text(lifespan)
            .attr('text-anchor', 'middle').attr('y', lineY).attr('dominant-baseline', 'central')
            .attr('font-size', fs * 0.8).attr('fill', tc).attr('font-family', ff)
          lineY += fs * 1.3
        }
        if (d.title) {
          label.append('text').text(d.title)
            .attr('text-anchor', 'middle').attr('y', lineY).attr('dominant-baseline', 'central')
            .attr('font-size', fs * 0.9).attr('fill', tc).attr('font-family', ff)
        }
        return
      }

      // circle/diamond/hexagon/ellipse: name is centered ON the shape;
      // the draggable outside label carries title + lifespan (if any).
      const nameLabelG = label.append('g').attr('class', 'name-label-g')
        .style('pointer-events', 'all').style('cursor', 'grab')
        .call(lblDrag as any)

      if (d.labelBgShape && d.labelBgColor) {
        nameLabelG.append('rect').attr('class', 'name-label-bg')
          .attr('rx', d.labelBgShape === 'pill' ? 999 : 4)
          .attr('ry', d.labelBgShape === 'pill' ? 999 : 4)
          .attr('fill', d.labelBgColor).attr('opacity', 0.85)
      }

      let lineY = 0
      if (d.title) {
        const t = nameLabelG.append('text').text(d.title)
          .attr('text-anchor', 'middle').attr('y', lineY).attr('dominant-baseline', 'central')
          .attr('font-size', fs * 0.9).attr('fill', tc).attr('font-family', ff)
        if (d.profileUrl) {
          t.style('cursor', 'pointer').on('click', (event: MouseEvent) => {
            event.stopPropagation()
            window.open(d.profileUrl, '_blank')
          })
        }
        lineY += fs * 1.3
      }

      let lifespan = ''
      if (d.birth && d.death) lifespan = `${d.birth} – ${d.death}`
      else if (d.birth) lifespan = d.birth
      else if (d.age) lifespan = d.age
      if (lifespan) {
        nameLabelG.append('text').text(lifespan)
          .attr('text-anchor', 'middle').attr('y', lineY).attr('dominant-baseline', 'central')
          .attr('font-size', fs * 0.8).attr('fill', tc).attr('font-family', ff)
      }
    })

    // ── Description groups (separate draggable layer) ────────────────────────────
    const descGroup = container.append('g').attr('class', 'desc-groups')
    const descSel = descGroup.selectAll<SVGGElement, SimNode>('g.desc-g')
      .data(nodes.filter(n => !!n.description)).enter()
      .append('g').attr('class', 'desc-g')
      .style('pointer-events', 'all').style('cursor', 'grab')
      .call(descDrag as any)

    descSel.each(function(d) {
      const descG = d3.select(this)
      const s = d.nodeSize || 40
      const fs = d.labelFontSize || 12
      const tc = d.labelColor || '#334155'
      const maxW = d.descriptionWidth || Math.max(s * 2, 160)

      if (d.descriptionBgShape && d.descriptionBgColor) {
        descG.append('rect').attr('class', 'desc-bg-rect')
          .attr('rx', d.descriptionBgShape === 'pill' ? 999 : 4)
          .attr('ry', d.descriptionBgShape === 'pill' ? 999 : 4)
          .attr('fill', d.descriptionBgColor).attr('opacity', 0.85)
      }

      descG.append('foreignObject')
        .attr('x', -maxW / 2).attr('y', -fs * 0.5).attr('width', maxW).attr('height', 100)
        .append('xhtml:div')
        .style('color', tc).style('font-size', `${fs * 0.8}px`).style('font-family', 'sans-serif')
        .style('text-align', 'center').style('word-break', 'break-word').style('line-height', '1.2')
        .style('user-select', 'none')
        .text(d.description!)
    })

    const EDGE_LABEL: Record<string, string> = {
      'parent-child': '親子',
      'marriage':     '結婚',
      'remarriage':   '再婚',
      'succession':   '継承',
      'sibling':      '兄弟',
      'ally':         '同盟',
      'rival':        '対立',
      'mentor':       '師弟',
      'enemy':        '敵対',
      'friend':       '親友',
    }

    // Relationship labels — white halo via paint-order for readability on any background
    const linkLabelSel = container.append('g').attr('class', 'link-labels')
      .selectAll<SVGTextElement, SimLink>('text')
      .data(links).enter().append('text')
      .text(d => {
        if (d.type === 'partner') return ''
        return d.label || EDGE_LABEL[d.type] || d.type
      })
      .attr('font-size', 11).attr('text-anchor', 'middle').attr('pointer-events', 'none')
      .attr('fill', edgeColor)
      .attr('font-weight', 'bold')
      .style('paint-order', 'stroke')
      .style('stroke', 'rgba(255,255,255,0.92)')
      .style('stroke-width', '3px')
      .style('stroke-linecap', 'round')

    // Helper: build a curved SVG path for a link
    const buildLinkPath = (d: SimLink) => {
      const dx = d.target.x - d.source.x
      const dy = d.target.y - d.source.y
      const len = Math.hypot(dx, dy) || 1
      const rS = getNodeRadius(d.source)
      const rT = getNodeRadius(d.target)
      const x1 = snapToGrid(d.source.x + (dx / len) * rS)
      const y1 = snapToGrid(d.source.y + (dy / len) * rS)
      const x2 = snapToGrid(d.target.x - (dx / len) * rT)
      const y2 = snapToGrid(d.target.y - (dy / len) * rT)
      const idx = edgeCurveIndex.get(d.id) ?? 0
      if (idx === 0) return `M ${x1} ${y1} L ${x2} ${y2}`
      // Perpendicular offset for quadratic bezier control point
      const offset = idx * 55
      const cx = snapToGrid((x1 + x2) / 2 + (-dy / len) * offset)
      const cy = snapToGrid((y1 + y2) / 2 + (dx / len) * offset)
      return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
    }

    // Tick
    simulation.on('tick', () => {
      linkSel.attr('d', buildLinkPath)

      nodeSel.attr('transform', d => `translate(${snapToGrid(d.x)},${snapToGrid(d.y)})`)
      labelSel.attr('transform', d => {
        const off = lblOffMap.get(d.id) ?? { x: 0, y: 0 }
        return `translate(${snapToGrid(d.x + off.x)},${snapToGrid(d.y + off.y)})`
      })
      descSel.attr('transform', d => {
        const off = descOffMap.get(d.id) ?? { x: 0, y: 0 }
        return `translate(${snapToGrid(d.x + off.x)},${snapToGrid(d.y + off.y)})`
      })

      // Fit bg rects via getBBox
      labelSel.each(function() {
        const bgRect = d3.select(this).select<SVGRectElement>('.name-label-bg')
        if (bgRect.empty()) return
        const gEl = d3.select(this).select<SVGGElement>('.name-label-g').node()
        if (!gEl) return
        try {
          const b = gEl.getBBox()
          const p = 5
          bgRect.attr('x', b.x - p).attr('y', b.y - p)
            .attr('width', b.width + p * 2).attr('height', b.height + p * 2)
        } catch (_) {}
      })

      // Fit description bg rects
      descSel.each(function() {
        const bgRect = d3.select(this).select<SVGRectElement>('.desc-bg-rect')
        if (bgRect.empty()) return
        const foEl = d3.select(this).select<SVGForeignObjectElement>('foreignObject').node()
        if (!foEl) return
        try {
          const b = foEl.getBBox()
          const p = 5
          bgRect.attr('x', b.x - p).attr('y', b.y - p)
            .attr('width', b.width + p * 2).attr('height', b.height + p * 2)
        } catch (_) {}
      })

      linkLabelSel
        .attr('x', d => {
          // Midpoint of bezier: 0.5*P0 + 0.5*P2 for straight, or bezier midpoint for curve
          const dx = d.target.x - d.source.x; const dy = d.target.y - d.source.y
          const len = Math.hypot(dx, dy) || 1
          const idx = edgeCurveIndex.get(d.id) ?? 0
          const mx = (d.source.x + d.target.x) / 2
          return snapToGrid(mx + (idx !== 0 ? (-dy / len) * idx * 27 : 0))
        })
        .attr('y', d => {
          const dx = d.target.x - d.source.x; const dy = d.target.y - d.source.y
          const len = Math.hypot(dx, dy) || 1
          const idx = edgeCurveIndex.get(d.id) ?? 0
          const my = (d.source.y + d.target.y) / 2
          return snapToGrid(my + (idx !== 0 ? (dx / len) * idx * 27 : 0))
        })
    })

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', event => {
        currentTransform.current = event.transform
        container.attr('transform', event.transform)
      })

    svg.call(zoom).on('dblclick.zoom', null)

    // Double-click empty canvas → add person
    svg.on('dblclick', function(event) {
      if (event.target !== this) return
      const [x, y] = d3.pointer(event, container.node())
      onAddPerson(x, y)
    })

    if (!initialZoomApplied.current) {
      const t = computeFit(dimensions.width, dimensions.height)
      svg.call(zoom.transform, t)
      currentTransform.current = t
      initialZoomApplied.current = true
    } else {
      svg.call(zoom.transform, currentTransform.current)
    }
    zoomRef.current = zoom

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && connectModeRef.current.active) {
        connectModeRef.current = { active: false, sourceId: '' }
        previewLine.style('display', 'none')
        nodeSel.select('.node-shape').attr('opacity', 1)
        nodeSel.select('.port-handles').style('display', 'none')
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      simulation.stop()
      simulationRef.current = null
      svg.selectAll('*').remove()
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [persons, relationships, dimensions, showGrid, gridSize, selectedNodeId,
    onNodeClick, onNodeCtrlClick, onEdgeClick, onConnectRequest, onAddPerson, onPositionChange,
    onBatchPositionChange, onNodeUpdate, computeFit])

  // Update selection rings without full redraw
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll<SVGElement, SimNode>('.selection-ring')
      .style('display', function() {
        const parentEl = (this as SVGElement).parentElement
        if (!parentEl) return 'none'
        const d = d3.select<SVGGElement, SimNode>(parentEl as unknown as SVGGElement).datum()
        return d && selectedNodeId && d.id === selectedNodeId ? null : 'none'
      })
  }, [selectedNodeId])

  // Update Ctrl-click connect-source ring without full redraw
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll<SVGElement, SimNode>('.connect-ring')
      .style('display', function() {
        const parentEl = (this as SVGElement).parentElement
        if (!parentEl) return 'none'
        const d = d3.select<SVGGElement, SimNode>(parentEl as unknown as SVGGElement).datum()
        return d && connectSourceId && d.id === connectSourceId ? null : 'none'
      })
  }, [connectSourceId])

  return (
    <div ref={containerRef} className="relative w-full h-full border rounded-lg overflow-hidden bg-gray-50">
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 bg-white p-2 rounded shadow">
        <button onClick={handleZoomIn}
          className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-white text-gray-700 font-bold hover:bg-gray-50"
          aria-label="Zoom In">+</button>
        <button onClick={handleZoomOut}
          className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-white text-gray-700 font-bold hover:bg-gray-50"
          aria-label="Zoom Out">-</button>
        <button onClick={handleResetZoom}
          className="w-8 h-8 flex items-center justify-center rounded border border-gray-300 bg-white text-gray-700 text-sm hover:bg-gray-50"
          aria-label="Reset Zoom">↺</button>
      </div>

      <div className="absolute top-2 right-2 z-10 flex items-center gap-3 bg-white p-2 rounded shadow">
        <label className="flex items-center gap-1 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)}
            className="h-4 w-4 rounded text-blue-600" />
          Grid
        </label>
        <select value={gridSize} onChange={e => setGridSize(Number(e.target.value))}
          className="rounded border border-gray-300 text-sm px-1 py-0.5">
          <option value={10}>10px</option>
          <option value={20}>20px</option>
          <option value={30}>30px</option>
          <option value={40}>40px</option>
          <option value={50}>50px</option>
        </select>
        <button onClick={handleAutoLayout}
          className="px-2 py-1 text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
          Auto Layout
        </button>
      </div>

      <svg ref={svgRef} width={dimensions.width} height={dimensions.height}
        className="cursor-move" />
    </div>
  )
}
