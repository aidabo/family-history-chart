'use client'
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import * as d3 from 'd3'
import type { PersonNode, Relationship, VerticalTextMode, NoteShape, ViewSettings } from '@/types/charts'
import { isDecorShape, drawShapeArt, decorSize, decorMeta, ensureShapeArtDefs,
  isPortraitShape, drawPortraitFrame, drawPersonSilhouette, portraitMeta } from './shapeArt'
import { computeFamilyLayout, pickAutoMode, parseYear, formatYear, type LayoutMode } from '@/utils/familyLayout'
import { UsersIcon } from '@heroicons/react/24/outline'

// Resolve a field's text style: per-field override (nameStyle/titleStyle/descriptionStyle)
// falling back to the node-level defaults (labelColor/labelFontSize/fontFamily/labelBold).
function textStyleOf(d: PersonNode, field: 'name' | 'title' | 'description') {
  const s = field === 'name' ? d.nameStyle : field === 'title' ? d.titleStyle : d.descriptionStyle
  return {
    color: s?.color ?? d.labelColor,
    size: s?.fontSize ?? d.labelFontSize,
    font: s?.fontFamily ?? d.fontFamily,
    bold: s?.bold ?? (d.labelBold !== false),
  }
}

// Parametric manga-style frame silhouettes, centred at (0,0), fitting an rx×ry ellipse.
function isFrameShape(s?: NoteShape) { return s === 'oval' || s === 'cloud' || s === 'burst' }
function framePath(shape: NoteShape | undefined, rx: number, ry: number): string {
  if (shape === 'burst') {
    const spikes = 18, inner = 0.80, outer = 1.14
    let d = ''
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
      const rr = i % 2 ? inner : outer
      d += (i ? 'L' : 'M') + (Math.cos(a) * rx * rr).toFixed(1) + ',' + (Math.sin(a) * ry * rr).toFixed(1) + ' '
    }
    return d + 'Z'
  }
  if (shape === 'cloud') {
    const bumps = 11
    const pts: [number, number][] = []
    for (let i = 0; i < bumps; i++) { const a = (i / bumps) * Math.PI * 2 - Math.PI / 2; pts.push([Math.cos(a) * rx * 0.9, Math.sin(a) * ry * 0.9]) }
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} `
    for (let i = 0; i < bumps; i++) {
      const p2 = pts[(i + 1) % bumps]
      const mx = (pts[i][0] + p2[0]) / 2, my = (pts[i][1] + p2[1]) / 2
      const ca = Math.atan2(my, mx)
      d += `Q${(mx + Math.cos(ca) * rx * 0.28).toFixed(1)},${(my + Math.sin(ca) * ry * 0.28).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)} `
    }
    return d + 'Z'
  }
  // oval (default frame): ellipse via two arcs
  return `M${rx.toFixed(1)},0 A${rx.toFixed(1)},${ry.toFixed(1)} 0 1 0 ${(-rx).toFixed(1)},0 A${rx.toFixed(1)},${ry.toFixed(1)} 0 1 0 ${rx.toFixed(1)},0 Z`
}

// Build a combined affine transform for a rotatable/deformable label box.
function boxTransform(rot?: number, sx?: number, sy?: number, skew?: number): string | null {
  const parts: string[] = []
  if (rot) parts.push(`rotate(${rot})`)
  if ((sx != null && sx !== 1) || (sy != null && sy !== 1)) parts.push(`scale(${sx ?? 1},${sy ?? 1})`)
  if (skew) parts.push(`skewX(${skew})`)
  return parts.length ? parts.join(' ') : null
}

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
  initialTransform?: { k: number; x: number; y: number } | null   // restore saved zoom/pan
  initialViewSettings?: ViewSettings | null   // restore saved layout mode / spacing / grid
  background?: string          // canvas background color
  backgroundImage?: string     // background image layered over the color
  backgroundOpacity?: number   // 0..1 opacity for the color+image layer (default 1)
  verticalText?: VerticalTextMode  // chart-wide vertical writing mode (default 'off')
  editable?: boolean               // enable in-place (double-click) editing of name/description
  onInlineEdit?: (req: InlineEditRequest) => void  // double-click → host renders an overlay editor
}

export interface InlineEditRequest {
  nodeId: string
  field: 'name' | 'title' | 'description'
  value: string
  multiline: boolean
  left: number; top: number; width: number; height: number  // px, relative to the canvas container
  fontSize: number
  color: string
  fontFamily: string
  align: 'left' | 'center' | 'right'   // current text alignment (editable in the overlay toolbar)
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

// Organic "relationship map" layout: a d3 force simulation run to a settled state.
// forceCollide guarantees no overlaps; charge repulsion + link attraction pull the
// most-connected people (multiple hubs allowed) toward the centre and push weakly
// connected ones to the edge; couples/parent-child sit close via short, strong links.
// Runs synchronously on throw-away copies so the live simulation is untouched.
function forceLayoutPositions(nodes: SimNode[], links: SimLink[]): Record<string, { x: number; y: number }> {
  const radiusById = new Map(nodes.map(n => [n.id, getNodeRadius(n)]))
  const work = nodes.map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y }))
  const byId = new Map(work.map(n => [n.id, n]))
  const wlinks = links
    .map(l => ({ source: l.source.id, target: l.target.id, type: l.type }))
    .filter(l => byId.has(l.source) && byId.has(l.target))

  // Union → partner ids (captured before forceLink rewrites source/target to objects).
  const unionPartners = new Map<string, string[]>()
  for (const l of wlinks) if (l.type === 'partner') {
    const a = unionPartners.get(l.target) || []; a.push(l.source); unionPartners.set(l.target, a)
  }

  const sim = d3.forceSimulation(work as unknown as d3.SimulationNodeDatum[])
    .force('link', d3.forceLink(wlinks as unknown as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
      .id((d: d3.SimulationNodeDatum) => (d as unknown as { id: string }).id)
      .distance((l) => { const t = (l as unknown as { type?: string }).type; return t === 'partner' ? 95 : t === 'parent-child' ? 150 : 220 })
      .strength((l) => { const t = (l as unknown as { type?: string }).type; return t === 'partner' ? 1 : t === 'parent-child' ? 0.5 : 0.15 }))
    // Strong, long-range repulsion so nodes spread far apart; collide guarantees the
    // hard no-overlap constraint (radius = node radius + generous padding).
    .force('charge', d3.forceManyBody().strength(-1400).distanceMax(2000))
    .force('collide', d3.forceCollide<d3.SimulationNodeDatum>().radius((d) => (radiusById.get((d as unknown as { id: string }).id) ?? 40) + 30).iterations(4).strength(1))
    .force('x', d3.forceX(600).strength(0.02))
    .force('y', d3.forceY(400).strength(0.02))
    .force('marriage', () => {
      for (const n of work) {
        if (n.type !== 'union') continue
        const ps = (unionPartners.get(n.id) || []).map(id => byId.get(id)).filter(Boolean) as Array<{ x: number; y: number }>
        if (ps.length === 2) { n.x += ((ps[0].x + ps[1].x) / 2 - n.x) * 0.35; n.y += ((ps[0].y + ps[1].y) / 2 - n.y) * 0.35 }
      }
    })
    .stop()

  for (let i = 0; i < 500; i++) sim.tick()

  const positions: Record<string, { x: number; y: number }> = {}
  for (const n of work) positions[n.id] = { x: n.x, y: n.y }
  return positions
}

// Timeline finisher: keep each node on its birth-year row (strong y anchor = the main
// time axis) while forceCollide removes overlaps — pushing nodes apart mostly
// horizontally. x is only loosely anchored to the family-grouped base, so the
// horizontal axis reads as "roughly placed", never overlapping.
function relaxTimelinePositions(nodes: SimNode[], base: Record<string, { x: number; y: number }>): Record<string, { x: number; y: number }> {
  const radiusById = new Map(nodes.map(n => [n.id, getNodeRadius(n)]))
  const work = nodes.map(n => ({ id: n.id, x: base[n.id]?.x ?? n.x, y: base[n.id]?.y ?? n.y }))
  const tx = new Map(work.map(n => [n.id, n.x]))
  const ty = new Map(work.map(n => [n.id, n.y]))
  const idOf = (d: d3.SimulationNodeDatum) => (d as unknown as { id: string }).id
  const sim = d3.forceSimulation(work as unknown as d3.SimulationNodeDatum[])
    .force('collide', d3.forceCollide<d3.SimulationNodeDatum>().radius((d) => (radiusById.get(idOf(d)) ?? 40) + 16).iterations(4).strength(1))
    .force('y', d3.forceY<d3.SimulationNodeDatum>((d) => ty.get(idOf(d)) ?? 0).strength(0.9))
    .force('x', d3.forceX<d3.SimulationNodeDatum>((d) => tx.get(idOf(d)) ?? 0).strength(0.05))
    .stop()
  for (let i = 0; i < 300; i++) sim.tick()
  const positions: Record<string, { x: number; y: number }> = {}
  for (const n of work) positions[n.id] = { x: n.x, y: n.y }
  return positions
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

export interface DynastyNetworkHandle {
  /** Add a person at the current viewport center (in content coordinates). */
  addPersonAtCenter: () => void
  /** Current zoom/pan transform, for persisting page view state. */
  getViewport: () => { k: number; x: number; y: number }
  /** Animate zoom to the given scale k, keeping the viewport center fixed in content space. */
  setZoom: (k: number) => void
  /** Fit all content into the viewport (same as the ↺ toolbar button). */
  fitToContent: () => void
  /** Visible content rect in content coordinates: the area currently shown in the viewport. */
  getVisibleRect: () => { x: number; y: number; w: number; h: number }
  /** Current toolbar/layout settings, for persisting with the page. */
  getViewSettings: () => ViewSettings
}

const DynastyNetwork = forwardRef<DynastyNetworkHandle, DynastyNetworkProps>(function DynastyNetwork({
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
  initialTransform,
  initialViewSettings,
  background,
  backgroundImage,
  backgroundOpacity,
  verticalText,
  editable,
  onInlineEdit,
}: DynastyNetworkProps, ref) {
  // Keep the latest callbacks in a ref so the heavy D3 effect doesn't re-run (which
  // rebuilds every node → a flash) when the parent re-renders with new callback
  // identities (e.g. on Save, when context functions like updatePerson are recreated).
  const cbRef = useRef({ onNodeClick, onNodeCtrlClick, onEdgeClick, onConnectRequest, onAddPerson, onPositionChange, onBatchPositionChange, onNodeUpdate, onInlineEdit })
  cbRef.current = { onNodeClick, onNodeCtrlClick, onEdgeClick, onConnectRequest, onAddPerson, onPositionChange, onBatchPositionChange, onNodeUpdate, onInlineEdit }
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
  // Double-tap detection state must survive effect re-runs (a node click re-runs the
  // effect via selectedNodeId, which would otherwise reset an effect-local variable).
  const lastTapRef = useRef<{ id: string; t: number } | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [gridSize, setGridSize] = useState(20)
  const [showGrid, setShowGrid] = useState(true)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force')
  const [spacing, setSpacing] = useState(1)
  const spacingRef = useRef(1)   // last-applied spacing factor
  const [lastLayoutKind, setLastLayoutKind] = useState<'tidy' | 'timeline' | 'force' | null>(null)
  // Parent-child wiring style. 'ortho' draws a shared horizontal "bus" (bracket) per parent
  // so siblings hang from one bar; only takes effect in 系図(tidy). Default straight (unchanged).
  const [edgeStyle, setEdgeStyle] = useState<'straight' | 'ortho'>('straight')

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

  // Expose imperative handle — declared after computeFit so it can reference it.
  useImperativeHandle(ref, () => ({
    addPersonAtCenter: () => {
      const t = currentTransform.current
      const k = t.k || 1
      const cx = (dimensions.width / 2 - t.x) / k
      const cy = (dimensions.height / 2 - t.y) / k
      cbRef.current.onAddPerson(cx, cy)
    },
    getViewport: () => {
      const t = currentTransform.current
      return { k: t.k, x: t.x, y: t.y }
    },
    setZoom: (k: number) => {
      if (!svgRef.current || !zoomRef.current) return
      const t = currentTransform.current
      // Keep the same content point at the viewport center
      const cx = (dimensions.width / 2 - t.x) / t.k
      const cy = (dimensions.height / 2 - t.y) / t.k
      const newT = d3.zoomIdentity
        .translate(dimensions.width / 2 - cx * k, dimensions.height / 2 - cy * k)
        .scale(k)
      d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.transform, newT)
      currentTransform.current = newT
    },
    fitToContent: () => {
      if (!svgRef.current || !zoomRef.current) return
      const t = computeFit(dimensions.width, dimensions.height)
      d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.transform, t)
      currentTransform.current = t
    },
    getVisibleRect: () => {
      const t = currentTransform.current
      return {
        x: -t.x / t.k,
        y: -t.y / t.k,
        w: dimensions.width / t.k,
        h: dimensions.height / t.k,
      }
    },
    getViewSettings: (): ViewSettings => ({
      layoutMode, lastLayoutKind: lastLayoutKind ?? undefined, spacing, showGrid, gridSize, edgeStyle,
    }),
  }), [dimensions, onAddPerson, computeFit, layoutMode, lastLayoutKind, spacing, showGrid, gridSize, edgeStyle])

  // Restore saved toolbar/layout settings once when the page loads. Positions are already
  // stored at the saved spacing, so spacing only restores the slider baseline (no re-scale);
  // lastLayoutKind restores the timeline axis; the mode dropdown reflects the saved choice.
  const viewSettingsApplied = useRef(false)
  useEffect(() => {
    if (viewSettingsApplied.current || !initialViewSettings) return
    viewSettingsApplied.current = true
    const vs = initialViewSettings
    if (vs.layoutMode) setLayoutMode(vs.layoutMode)
    if (vs.lastLayoutKind) setLastLayoutKind(vs.lastLayoutKind)
    if (typeof vs.spacing === 'number') { setSpacing(vs.spacing); spacingRef.current = vs.spacing }
    if (typeof vs.showGrid === 'boolean') setShowGrid(vs.showGrid)
    if (typeof vs.gridSize === 'number') setGridSize(vs.gridSize)
    if (vs.edgeStyle === 'straight' || vs.edgeStyle === 'ortho') setEdgeStyle(vs.edgeStyle)
  }, [initialViewSettings])

  const runAutoLayout = useCallback((mode: LayoutMode) => {
    if (!simulationRef.current) return
    const nodes = nodesRef.current.map(n => ({ id: n.id, type: n.type, gender: n.gender, birth: n.birth, death: n.death, name: n.name }))
    const links = linksRef.current.map(l => ({ source: l.source.id, target: l.target.id, type: l.type, label: l.label }))
    const resolved = mode === 'auto' ? pickAutoMode(nodes, links) : mode
    let positions: Record<string, { x: number; y: number }>
    if (resolved === 'force') {
      positions = forceLayoutPositions(nodesRef.current, linksRef.current)
    } else {
      positions = computeFamilyLayout(nodes, links, { mode: resolved }).positions
      // Timeline: keep the year axis (y) but resolve any overlaps via collision.
      if (resolved === 'timeline') positions = relaxTimelinePositions(nodesRef.current, positions)
    }
    cbRef.current.onBatchPositionChange(positions)
    for (const n of nodesRef.current) {
      const pos = positions[n.id]
      if (pos) { n.x = pos.x; n.y = pos.y; n.fx = pos.x; n.fy = pos.y }
    }
    setLastLayoutKind(resolved)   // drives the timeline year axis
    simulationRef.current.alpha(0.3).restart()
    // Fit the freshly-arranged tree into view.
    if (svgRef.current && zoomRef.current) {
      const t = computeFit(dimensions.width, dimensions.height)
      d3.select(svgRef.current).transition().duration(400).call(zoomRef.current.transform, t)
    }
  }, [onBatchPositionChange, computeFit, dimensions])

  const handleAutoLayout = useCallback(() => runAutoLayout(layoutMode), [runAutoLayout, layoutMode])

  // Spacing slider: scale every node's POSITION (coordinates) out/in from the content
  // centroid — nodes spread apart or draw closer without changing node size. Applied on
  // release so the heavy re-render happens once, not on every slider tick.
  const applySpacing = useCallback((val: number) => {
    const nodes = nodesRef.current
    if (!nodes.length) return
    const ratio = val / (spacingRef.current || 1)
    spacingRef.current = val
    if (ratio === 1) return
    let cx = 0, cy = 0
    for (const n of nodes) { cx += n.x; cy += n.y }
    cx /= nodes.length; cy /= nodes.length
    const positions: Record<string, { x: number; y: number }> = {}
    for (const n of nodes) {
      const nx = cx + (n.x - cx) * ratio, ny = cy + (n.y - cy) * ratio
      n.x = nx; n.y = ny; n.fx = nx; n.fy = ny
      positions[n.id] = { x: nx, y: ny }
    }
    cbRef.current.onBatchPositionChange(positions)
    simulationRef.current?.alpha(0.1).restart()
    // No auto-fit: keep the current zoom so the spacing change (nodes spreading apart or
    // drawing closer, at constant node size) is directly visible.
  }, [])

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

  useEffect(() => () => {
    simulationRef.current?.stop()
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
  }, [])

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

    // Notes (type:'note') are free-standing text boxes — not part of the graph
    // (no simulation, links, name or shape). They render in their own layer.
    const noteData = persons.filter(p => p.type === 'note')
    const graphPersons = persons.filter(p => p.type !== 'note')

    // Nodes with an explicit saved position are pinned (fx/fy) so the force layout
    // never re-scatters them — this preserves a computed Auto Layout (and dragged
    // positions) across re-renders. Only brand-new, unpositioned nodes are left free
    // for the force simulation to spread out.
    const nodes: SimNode[] = graphPersons.map(p => {
      const s = nodePositionsRef.current.get(p.id)
      const px = s?.x ?? p.x, py = s?.y ?? p.y
      const hasPos = px != null && py != null
      return { ...p, x: px ?? fallX, y: py ?? fallY, ...(hasPos ? { fx: px, fy: py } : {}) }
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

    // Grid + drawing board — a bounded "paper" that always contains the content
    // plus a margin, so the drawing area reads clearly. The board grows with the
    // content (recomputed each tick from the node bounding box), so nodes moved
    // toward the edge are never cut off — the board simply expands to include them.
    const BOARD_MARGIN = 16   // blank margin between the grid area and the board border
    const GRID_PAD = 40       // grid extends a little past the outermost nodes
    if (showGrid) {
      const pattern = defs.append('pattern')
        .attr('id', 'family-chart-grid')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', gridSize).attr('height', gridSize)
      pattern.append('path')
        .attr('d', `M ${gridSize} 0 L 0 0 0 ${gridSize}`)
        .attr('fill', 'none').attr('stroke', '#e5e7eb').attr('stroke-width', 0.5)
    }
    // Border first (behind), grid fill on top; both inside the zoom container so
    // they pan/zoom with the content. Nodes/edges are appended later → drawn above.
    const boardBorder = container.append('rect').attr('class', 'board-border')
      .attr('fill', 'none').attr('stroke', '#cbd5e1').attr('stroke-width', 1)
      .attr('rx', 6).attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none')
    const gridBg = showGrid
      ? container.append('rect').attr('class', 'grid-bg')
          .attr('fill', 'url(#family-chart-grid)').style('pointer-events', 'none')
      : null
    const updateBoard = () => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const n of nodes) {
        const r = getNodeRadius(n) + GRID_PAD
        if (n.x - r < minX) minX = n.x - r
        if (n.y - r < minY) minY = n.y - r
        if (n.x + r > maxX) maxX = n.x + r
        if (n.y + r > maxY) maxY = n.y + r
      }
      if (!Number.isFinite(minX)) return
      // Snap the grid area to the grid step so the pattern lines meet the edges cleanly.
      minX = Math.floor(minX / gridSize) * gridSize
      minY = Math.floor(minY / gridSize) * gridSize
      maxX = Math.ceil(maxX / gridSize) * gridSize
      maxY = Math.ceil(maxY / gridSize) * gridSize
      gridBg?.attr('x', minX).attr('y', minY)
        .attr('width', maxX - minX).attr('height', maxY - minY)
      boardBorder
        .attr('x', minX - BOARD_MARGIN).attr('y', minY - BOARD_MARGIN)
        .attr('width', maxX - minX + BOARD_MARGIN * 2)
        .attr('height', maxY - minY + BOARD_MARGIN * 2)
    }
    updateBoard()

    // Timeline year axis: a vertical scale down the left, with ticks at the years where
    // people actually sit (non-uniform — busy periods are stretched, matching the nodes,
    // not the other way round). Drawn inside the zoom container so it pans/zooms along.
    if (lastLayoutKind === 'timeline') {
      // One tick per dated node, top→bottom. A year that is EARLIER than a year already
      // seen higher up is out of chronological order (e.g. after a manual drag) → drawn
      // in red so the user can spot and fix the misplaced node.
      const pts = nodes
        .map(n => ({ yr: parseYear(n.birth), y: n.y }))
        .filter((p): p is { yr: number; y: number } => p.yr != null)
        .sort((a, b) => a.y - b.y)
      if (pts.length) {
        // "In order" = the longest non-decreasing run of years down the axis (LIS). Any
        // node NOT in it is the misplaced one (e.g. a young person dragged up among older
        // ones) → its year label is red. This flags the moved node itself, not everyone
        // below it.
        const yr = pts.map(p => p.yr)
        const n = yr.length, dp = new Array(n).fill(1), prev = new Array(n).fill(-1)
        let best = 0
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < i; j++) if (yr[j] <= yr[i] && dp[j] + 1 > dp[i]) { dp[i] = dp[j] + 1; prev[i] = j }
          if (dp[i] > dp[best]) best = i
        }
        const inOrder = new Set<number>()
        for (let k = best; k !== -1; k = prev[k]) inOrder.add(k)

        let minX = Infinity, minY = Infinity, maxY = -Infinity
        for (const nd of nodes) { const r = getNodeRadius(nd); minX = Math.min(minX, nd.x - r); minY = Math.min(minY, nd.y - r); maxY = Math.max(maxY, nd.y + r) }
        const axisX = minX - 70
        const axisG = container.append('g').attr('class', 'year-axis').style('pointer-events', 'none')
        axisG.append('line').attr('x1', axisX).attr('y1', minY).attr('x2', axisX).attr('y2', maxY)
          .attr('stroke', '#94a3b8').attr('stroke-width', 1).attr('vector-effect', 'non-scaling-stroke')
        let lastLabelY = -Infinity
        pts.forEach((p, i) => {
          const bad = !inOrder.has(i)      // misplaced relative to the chronological run
          const stroke = bad ? '#ef4444' : '#94a3b8'
          axisG.append('line').attr('x1', axisX - 5).attr('y1', p.y).attr('x2', axisX + 5).attr('y2', p.y)
            .attr('stroke', stroke).attr('stroke-width', 1).attr('vector-effect', 'non-scaling-stroke')
          if (bad || p.y - lastLabelY >= 24) {   // always label out-of-order ones; thin the rest
            axisG.append('text').attr('x', axisX - 8).attr('y', p.y).attr('text-anchor', 'end')
              .attr('dominant-baseline', 'middle').attr('font-size', 12)
              .attr('fill', bad ? '#ef4444' : '#64748b').attr('font-weight', bad ? 700 : 400)
              .text(formatYear(p.yr))
            lastLabelY = p.y
          }
        })
      }
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

    // Orthogonal "bus" wiring (系図 only): group parent-child links by their parent so
    // siblings share one horizontal bar. Each link stays its own <path> (per-edge click /
    // EdgeCard preserved); they just share the same bus Y, so the horizontals line up.
    const orthoBus = edgeStyle === 'ortho' && lastLayoutKind === 'tidy'
    const busGroups = new Map<string, SimLink[]>()
    if (orthoBus) {
      for (const l of links) {
        if (l.type !== 'parent-child') continue
        const k = l.source.id
        if (!busGroups.has(k)) busGroups.set(k, [])
        busGroups.get(k)!.push(l)
      }
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
      d.type === 'master'       ? '#c2410c' :
      d.type === 'disciple'     ? '#ca8a04' :
      d.type === 'comrade'      ? '#0d9488' :
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
        cbRef.current.onEdgeClick({ ...d, source: d.source.id, target: d.target.id }, event.clientX, event.clientY)
      })

    // Node drag — filter overridden so Ctrl/Cmd+click passes through (d3 ignores it by default)
    // Shift+drag moves the whole connected cluster (relative positions preserved).
    let cluster: { ids: string[]; orig: Map<string, { x: number; y: number }> } | null = null
    // Manual double-tap detection (native dblclick is swallowed by d3.drag unless Ctrl
    // is held; manual detection works with a plain double-click AND mobile double-tap).
    // lastTap uses a ref (see above) so a node click re-running the effect doesn't reset it.
    let lastTapDesc: { id: string; t: number } | null = null
    let descMoved = false
    let lastTapLbl: { id: string; t: number } | null = null
    let lblMoved = false
    let periodMoved = false
    const DBL_MS = 300
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
            cbRef.current.onBatchPositionChange(batch)
          } else {
            d.fx = d.x; d.fy = d.y
            nodePositionsRef.current.set(d.id, { x: d.x, y: d.y })
            cbRef.current.onPositionChange(d.id, d.x, d.y)
          }
          cluster = null
        } else if (se && (se.ctrlKey || se.metaKey) && onNodeCtrlClick) {
          cbRef.current.onNodeCtrlClick(d.id, se.clientX ?? 0, se.clientY ?? 0)
        } else {
          const sx = se?.clientX ?? 0
          const sy = se?.clientY ?? 0
          const now = Date.now()
          const lt = lastTapRef.current
          const canEdit = !!editable && !!cbRef.current.onInlineEdit && d.type !== 'union'
          if (canEdit && lt && lt.id === d.id && now - lt.t < DBL_MS) {
            // 2nd tap → edit name; cancel the deferred single-click (which would select+rebuild).
            if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null }
            lastTapRef.current = null
            openEditFromEl((this as SVGGElement).querySelector('.node-inline-label'), d, 'name')
          } else if (canEdit) {
            // 1st tap → defer selection so a quick 2nd tap can cancel it (no rebuild between taps).
            lastTapRef.current = { id: d.id, t: now }
            if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
            clickTimerRef.current = setTimeout(() => { clickTimerRef.current = null; cbRef.current.onNodeClick(d, sx, sy) }, DBL_MS)
          } else {
            cbRef.current.onNodeClick(d, sx, sy)
          }
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
    // ── Vertical writing (縦書き) helpers ────────────────────────────────────────
    // CJK detection covers Hiragana, Katakana (incl. halfwidth), and Han (Japanese
    // kanji + Chinese hanzi) so 'cjk' auto-mode triggers on Japanese/Chinese text.
    const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ]/
    const isCJK = (t?: string) => !!t && CJK_RE.test(t)
    const resolveVertical = (d: SimNode, text?: string): boolean => {
      if (d.vertical === 'on') return true
      if (d.vertical === 'off') return false
      if (verticalText === 'on') return true
      if (verticalText === 'cjk') return isCJK(text)
      return false
    }
    // Apply vertical-rl writing mode (inline styles so it survives thumbnail/PDF rasterization).
    const applyVertical = (sel: d3.Selection<any, unknown, null, undefined>) => {
      sel.style('writing-mode', 'vertical-rl').style('text-orientation', 'mixed')
    }

    // Open the React overlay editor for a node's name/description. anchorEl gives the
    // on-screen box to position the editor over. Attached at the interactive GROUP
    // level (node <g> / desc <g>) so double-click reliably fires regardless of the
    // label's pointer-events. The editor lives in React so it survives D3 re-renders.
    const openEditFromEl = (anchorEl: Element | null, d: SimNode, field: 'name' | 'title' | 'description') => {
      if (!editable || !cbRef.current.onInlineEdit) return
      const svgEl = svgRef.current
      if (!svgEl) return
      const cRect = svgEl.getBoundingClientRect()
      const eRect = (anchorEl ?? svgEl).getBoundingClientRect()
      const k = currentTransform.current.k || 1
      const multiline = field === 'description'
      const text = field === 'name' ? d.name : field === 'title' ? d.title : d.description
      const st = textStyleOf(d, field)
      const fs = (st.size || 13) * (multiline ? 0.8 : 1) * k
      // The editor is always a HORIZONTAL input. For vertical (縦書き) text the on-screen
      // box is a narrow tall column, so use its HEIGHT (≈ text length) as the box width.
      const vert = resolveVertical(d, text)
      let width: number, height: number
      if (multiline) {
        width = Math.max(eRect.width, 180); height = Math.max(eRect.height, 64)
      } else if (vert) {
        width = Math.max(eRect.height, eRect.width, 100); height = fs * 1.6 + 6
      } else {
        width = Math.max(eRect.width, 100); height = Math.max(eRect.height, 24)
      }
      cbRef.current.onInlineEdit!({
        nodeId: d.id, field,
        value: text || '',
        multiline,
        left: eRect.left - cRect.left,
        top: eRect.top - cRect.top,
        width,
        height,
        fontSize: fs,
        color: st.color || (field === 'name' ? '#333333' : '#334155'),
        fontFamily: st.font || 'sans-serif',
        align: d.descriptionAlign ?? 'center',
      })
    }

    const drawCenteredName = (g: d3.Selection<SVGGElement, unknown, null, undefined>, d: SimNode, halfW: number) => {
      const nst = textStyleOf(d, 'name')
      const fsz = nst.size || 12
      const weight = nst.bold ? 'bold' : 'normal'
      const vert = resolveVertical(d, d.name)
      const nameG = g.append('g').attr('class', 'node-inline-label').attr('pointer-events', 'none')
      const nameTf = boxTransform(d.labelRotation, d.labelScaleX, d.labelScaleY, d.labelSkewX)
      if (nameTf) nameG.attr('transform', nameTf)
      // Background is transparent by default; a band is drawn only when Label Background is set.
      if (d.labelBgShape && d.labelBgColor) {
        nameG.append('rect')
          .attr('x', -halfW).attr('y', -fsz).attr('width', halfW * 2).attr('height', fsz * 2)
          .attr('rx', d.labelBgShape === 'pill' ? 999 : 4)
          .attr('fill', d.labelBgColor).attr('opacity', 0.85)
      }
      // A subtle halo keeps the text readable over images / any fill without an opaque background.
      const nameText = nameG.append('text')
        .attr('text-anchor', 'middle')
        .attr(vert ? 'dominant-baseline' : 'dy', vert ? 'central' : '0.35em')
        .attr('font-size', fsz).attr('font-weight', weight)
        .attr('fill', nst.color || '#fff')
        .attr('font-family', nst.font || 'sans-serif')
        .style('paint-order', 'stroke')
        .style('stroke', 'rgba(0,0,0,0.35)')
        .style('stroke-width', d.image ? '3px' : '2px')
        .style('stroke-linejoin', 'round')
        .text(d.name || 'Unknown')
      if (vert) applyVertical(nameText)
    }

    // Labels rendered BELOW a shape (decorative / portrait). Horizontal: name/title/
    // lifespan stacked downward. Vertical: adjacent top-aligned columns, right→left
    // (name, then title, then lifespan) for a traditional 縦書き look.
    const drawBelowLabels = (
      g: d3.Selection<SVGGElement, unknown, null, undefined>, d: SimNode,
      shapeBottom: number, fs: number, tc: string, ff: string, weight: string,
    ) => {
      let lifespan = ''
      if (d.birth && d.death) lifespan = `${d.birth} – ${d.death}`
      else if (d.birth) lifespan = d.birth
      else if (d.age) lifespan = d.age
      const vName = resolveVertical(d, d.name)
      const vTitle = d.title ? resolveVertical(d, d.title) : false
      if (vName || vTitle) {
        const gap = fs * 1.35
        const top = shapeBottom + 4
        let col = 0
        const addCol = (text: string, size: number, w?: string) => {
          const t = g.append('text').attr('class', 'node-inline-label')
            .attr('text-anchor', 'start').attr('x', -col * gap).attr('y', top)
            .attr('font-size', size).attr('fill', tc).attr('font-family', ff)
            .attr('pointer-events', 'none').text(text)
          if (w) t.attr('font-weight', w)
          applyVertical(t)
          col++
          return t
        }
        addCol(d.name || 'Unknown', fs, weight)
        if (d.title) addCol(d.title, fs * 0.8)
        if (lifespan) addCol(lifespan, fs * 0.75)
      } else {
        let ly = shapeBottom + fs + 4
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
        if (lifespan) {
          g.append('text').attr('text-anchor', 'middle').attr('y', ly)
            .attr('font-size', fs * 0.75).attr('fill', tc).attr('font-family', ff)
            .attr('pointer-events', 'none').text(lifespan)
        }
      }
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
        drawBelowLabels(g as any, d, h / 2, fs, tc, ff, weight)
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
        drawBelowLabels(g as any, d, s, fs, tc, ff, weight)
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

        if (target) cbRef.current.onConnectRequest(sourceId, target.id)

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

    // Period (lifespan) has its own offset so it can be dragged independently of title.
    const periodOffMap = new Map<string, { x: number; y: number }>()
    for (const nd of nodes) {
      if (nd.periodOffsetX != null || nd.periodOffsetY != null) {
        periodOffMap.set(nd.id, { x: nd.periodOffsetX ?? 0, y: nd.periodOffsetY ?? 0 })
      } else {
        const base = lblOffMap.get(nd.id) ?? { x: 0, y: 0 }
        const fs2 = nd.labelFontSize || 12
        // Default: just below the title (or beside it, left column, when vertical).
        if (!nd.title) periodOffMap.set(nd.id, { x: base.x, y: base.y })
        else if (resolveVertical(nd, nd.title)) periodOffMap.set(nd.id, { x: base.x - fs2 * 1.6, y: base.y })
        else periodOffMap.set(nd.id, { x: base.x, y: base.y + fs2 * 1.5 })
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
        lblMoved = false
        d3.select(this).style('cursor', 'grabbing')
      })
      .on('drag', function(event, d) {
        lblMoved = true
        const off = lblOffMap.get(d.id) ?? { x: 0, y: 0 }
        const newOff = { x: off.x + event.dx, y: off.y + event.dy }
        lblOffMap.set(d.id, newOff)
        // Move the dragged group itself (like the description drag) — the parent
        // .node-label follows the node via tick, so there's no transform fight → no blink.
        d3.select(this).attr('transform', `translate(${newOff.x},${newOff.y})`)
      })
      .on('end', function(_, d) {
        d3.select(this).style('cursor', 'grab')
        if (lblMoved) {
          const off = lblOffMap.get(d.id)!
          cbRef.current.onNodeUpdate?.(d.id, { labelOffsetX: off.x, labelOffsetY: off.y })
        } else if (editable && cbRef.current.onInlineEdit) {
          // Click (no drag): manual double-tap → edit the title.
          const now = Date.now()
          if (lastTapLbl && lastTapLbl.id === d.id && now - lastTapLbl.t < DBL_MS) {
            lastTapLbl = null
            const el = (this as SVGGElement).querySelector('text') || (this as SVGGElement)
            openEditFromEl(el as Element, d, 'title')
          } else {
            lastTapLbl = { id: d.id, t: now }
          }
        }
      })

    // ── Period (lifespan) drag — independent of the title label ──────────────────
    const periodDrag = d3.drag<SVGGElement, SimNode>()
      .on('start', function(event) {
        event.sourceEvent.stopPropagation()
        periodMoved = false
        d3.select(this).style('cursor', 'grabbing')
      })
      .on('drag', function(event, d) {
        periodMoved = true
        const off = periodOffMap.get(d.id) ?? { x: 0, y: 0 }
        const newOff = { x: off.x + event.dx, y: off.y + event.dy }
        periodOffMap.set(d.id, newOff)
        d3.select(this).attr('transform', `translate(${newOff.x},${newOff.y})`)
      })
      .on('end', function(_, d) {
        d3.select(this).style('cursor', 'grab')
        if (periodMoved) {
          const off = periodOffMap.get(d.id)!
          cbRef.current.onNodeUpdate?.(d.id, { periodOffsetX: off.x, periodOffsetY: off.y })
        }
      })

    // ── Description drag ─────────────────────────────────────────────────────────
    const descDrag = d3.drag<SVGGElement, SimNode>()
      .on('start', function(event) {
        event.sourceEvent.stopPropagation()
        descMoved = false
        d3.select(this).style('cursor', 'grabbing')
      })
      .on('drag', function(event, d) {
        descMoved = true
        const off = descOffMap.get(d.id) ?? { x: 0, y: 0 }
        const newOff = { x: off.x + event.dx, y: off.y + event.dy }
        descOffMap.set(d.id, newOff)
        d3.select(this).attr('transform',
          `translate(${snapToGrid(d.x + newOff.x)},${snapToGrid(d.y + newOff.y)})`)
      })
      .on('end', function(_, d) {
        d3.select(this).style('cursor', 'grab')
        if (descMoved) {
          const off = descOffMap.get(d.id)!
          cbRef.current.onNodeUpdate?.(d.id, { descriptionOffsetX: off.x, descriptionOffsetY: off.y })
        } else if (editable && cbRef.current.onInlineEdit) {
          // Click (no drag): manual double-tap → in-place edit (mobile-friendly, no Ctrl).
          const now = Date.now()
          if (lastTapDesc && lastTapDesc.id === d.id && now - lastTapDesc.t < DBL_MS) {
            lastTapDesc = null
            openEditFromEl((this as SVGGElement).querySelector('foreignObject'), d, 'description')
          } else {
            lastTapDesc = { id: d.id, t: now }
          }
        }
      })

    // Size the description box + frame to the ACTUAL text (no blank rows/columns).
    // Horizontal: width is user-controlled (wrap width), height auto-fits content.
    // Vertical:   height is user-controlled (column length), width auto-fits content.
    const fitDescBox = (gNode: SVGGElement, d: SimNode, overrideW?: number, overrideH?: number) => {
      const self = d3.select(gNode)
      const foSel = self.select<SVGForeignObjectElement>('foreignObject')
      const foEl = foSel.node()
      if (!foEl) return
      const divEl = foEl.querySelector('div') as HTMLElement | null
      if (!divEl) return
      const vDesc = resolveVertical(d, d.description)
      const s = d.nodeSize || 40
      const W = overrideW ?? d.descriptionWidth ?? Math.max(s * 2, 160)
      const H = overrideH ?? d.descriptionHeight ?? 200
      let cw: number, ch: number
      try {
        if (vDesc) {
          foSel.attr('height', H).attr('width', 4000) // temp wide so all columns lay out
          cw = Math.max(20, Math.min(4000, Math.ceil(divEl.scrollWidth)))
          ch = H
        } else {
          foSel.attr('width', W).attr('height', 4000) // temp tall so all lines lay out
          ch = Math.max(20, Math.min(4000, Math.ceil(divEl.scrollHeight)))
          cw = W
        }
      } catch { return }
      foSel.attr('width', cw).attr('height', ch).attr('x', -cw / 2).attr('y', -ch / 2)
      const p = 5
      self.selectAll<SVGRectElement, unknown>('.desc-bg-rect, .desc-border-rect')
        .attr('x', -cw / 2 - p).attr('y', -ch / 2 - p)
        .attr('width', cw + 2 * p).attr('height', ch + 2 * p)
      // Speech-bubble tail: a downward triangle at the bottom-left of the box.
      const tail = self.select('.note-tail')
      if (!tail.empty()) {
        const yb = ch / 2 + p - 1
        const bx = -cw / 2 + Math.min(cw * 0.35, 60)
        tail.attr('points', `${bx - 11},${yb} ${bx + 11},${yb} ${bx - 3},${yb + 15}`)
      }
      // Manga frame silhouette: size the ellipse so the text RECTANGLE fits fully inside
      // (a rectangle inscribed in an ellipse needs semi-axes ≈ √2× its half-extents; burst
      // spikes/cloud bumps pull the inner edge in, so divide by that inner fraction).
      const framep = self.select('.desc-bg-path')
      if (!framep.empty()) {
        const shape = (d as PersonNode).noteShape
        const inner = shape === 'burst' ? 0.80 : shape === 'cloud' ? 0.9 : 1
        const pad = 12
        const rx = (cw / 2) * Math.SQRT2 / inner + pad
        const ry = (ch / 2) * Math.SQRT2 / inner + pad
        framep.attr('d', framePath(shape, rx, ry))
      }
      const handle = self.select('.desc-resize')
      if (vDesc) handle.attr('x', -4).attr('y', ch / 2 - 4).style('cursor', 'ns-resize')
      else handle.attr('x', cw / 2 - 4).attr('y', -4).style('cursor', 'ew-resize')
    }

    // ── Description resize: horizontal → width, vertical → height (drag the handle) ─
    // While dragging, resize the box PLAINLY (no content auto-fit — that would fight
    // the drag). Auto-fit the frame to the text only on release. descResizingId keeps
    // the tick loop from re-fitting the box mid-drag.
    let descResizingId: string | null = null
    const descResizeDrag = d3.drag<SVGRectElement, SimNode>()
      .on('start', function(event, d) { event.sourceEvent.stopPropagation(); descResizingId = d.id })
      .on('drag', function(event, d) {
        const g = this.parentNode as SVGGElement
        const self = d3.select(g)
        const foSel = self.select<SVGForeignObjectElement>('foreignObject')
        if (foSel.empty()) return
        const vDesc = resolveVertical(d, d.description)
        let cw = +foSel.attr('width'), ch = +foSel.attr('height')
        if (vDesc) ch = Math.max(60, Math.min(800, ch + event.dy * 2))
        else cw = Math.max(80, Math.min(600, cw + event.dx * 2))
        foSel.attr('width', cw).attr('height', ch).attr('x', -cw / 2).attr('y', -ch / 2)
        const p = 5
        self.selectAll<SVGRectElement, unknown>('.desc-bg-rect, .desc-border-rect')
          .attr('x', -cw / 2 - p).attr('y', -ch / 2 - p).attr('width', cw + 2 * p).attr('height', ch + 2 * p)
        const handle = self.select('.desc-resize')
        if (vDesc) handle.attr('x', -4).attr('y', ch / 2 - 4)
        else handle.attr('x', cw / 2 - 4).attr('y', -4)
      })
      .on('end', function(_, d) {
        descResizingId = null
        const g = this.parentNode as SVGGElement
        const foSel = d3.select(g).select<SVGForeignObjectElement>('foreignObject')
        if (resolveVertical(d, d.description)) cbRef.current.onNodeUpdate?.(d.id, { descriptionHeight: Math.round(+foSel.attr('height')) })
        else cbRef.current.onNodeUpdate?.(d.id, { descriptionWidth: Math.round(+foSel.attr('width')) })
        fitDescBox(g, d) // snap the frame to the text now that resizing is done
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
          'ally': '同盟', 'mentor': '師弟', 'master': '師匠', 'disciple': '弟子',
          'comrade': '戦友', 'rival': '対立', 'enemy': '敵対', 'custom': '',
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
      const lblOff0 = lblOffMap.get(d.id) ?? { x: 0, y: 0 }
      const nameLabelG = label.append('g').attr('class', 'name-label-g')
        .attr('transform', `translate(${lblOff0.x},${lblOff0.y})`)
        .style('pointer-events', 'all').style('cursor', 'grab')
        .call(lblDrag as any)

      if (d.labelBgShape && d.labelBgColor) {
        nameLabelG.append('rect').attr('class', 'name-label-bg')
          .attr('rx', d.labelBgShape === 'pill' ? 999 : 4)
          .attr('ry', d.labelBgShape === 'pill' ? 999 : 4)
          .attr('fill', d.labelBgColor).attr('opacity', 0.85)
      }

      let lifespan = ''
      if (d.birth && d.death) lifespan = `${d.birth} – ${d.death}`
      else if (d.birth) lifespan = d.birth
      else if (d.age) lifespan = d.age

      const openProfile = (t: d3.Selection<SVGTextElement, unknown, null, undefined>) => {
        if (d.profileUrl) {
          t.style('cursor', 'pointer').on('click', (event: MouseEvent) => {
            event.stopPropagation()
            window.open(d.profileUrl, '_blank')
          })
        }
      }

      // Title lives in nameLabelG (draggable + double-tap editable). Uses its own style.
      if (d.title) {
        const tst = textStyleOf(d, 'title')
        const tsize = tst.size || 12
        const vt = resolveVertical(d, d.title)
        // Vertical SVG text hit-tests as a horizontal strip, so clicks on the column
        // miss. Add a transparent rect covering the actual (vertical) column.
        if (vt) {
          const h = Math.max(1, [...d.title].length) * tsize * 1.05
          nameLabelG.append('rect').attr('class', 'lbl-hit')
            .attr('x', -tsize * 0.75).attr('y', -h / 2).attr('width', tsize * 1.5).attr('height', h)
            .attr('fill', 'transparent')
        }
        const t = nameLabelG.append('text').text(d.title)
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-size', tsize).attr('font-weight', tst.bold ? 'bold' : 'normal')
          .attr('fill', tst.color || tc).attr('font-family', tst.font || ff)
        if (vt) applyVertical(t)
        openProfile(t)
      }

      // Period (lifespan) lives in its OWN draggable group, moved independently of title.
      if (lifespan) {
        const pOff = periodOffMap.get(d.id) ?? { x: 0, y: 0 }
        const periodG = label.append('g').attr('class', 'period-g')
          .attr('transform', `translate(${pOff.x},${pOff.y})`)
          .style('pointer-events', 'all').style('cursor', 'grab')
          .call(periodDrag as any)
        const vp = resolveVertical(d, d.name)
        if (vp) {
          const fsz = fs * 0.8
          const h = Math.max(1, [...lifespan].length) * fsz * 1.05
          periodG.append('rect').attr('class', 'lbl-hit')
            .attr('x', -fsz * 0.75).attr('y', -h / 2).attr('width', fsz * 1.5).attr('height', h)
            .attr('fill', 'transparent')
        }
        const l = periodG.append('text').text(lifespan)
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-size', fs * 0.8).attr('fill', tc).attr('font-family', ff)
        if (vp) applyVertical(l)
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
      const dst = textStyleOf(d, 'description')
      const vDesc = resolveVertical(d, d.description)
      // Inner group carries the rotation so the box + text rotate as a whole, while
      // desc-g keeps the (drag) position. fitDescBox selects descendants, so it still works.
      const inner = descG.append('g').attr('class', 'desc-inner')
      const innerTf = boxTransform(d.descriptionRotation, d.descriptionScaleX, d.descriptionScaleY, d.descriptionSkewX)
      if (innerTf) inner.attr('transform', innerTf)

      if (d.descriptionBgShape && d.descriptionBgColor) {
        inner.append('rect').attr('class', 'desc-bg-rect')
          .attr('rx', d.descriptionBgShape === 'pill' ? 999 : 4)
          .attr('ry', d.descriptionBgShape === 'pill' ? 999 : 4)
          .attr('fill', d.descriptionBgColor).attr('opacity', d.descriptionBgOpacity ?? 0.85)
      }
      // Optional frame (border), tight to the text (sized in fitDescBox).
      if (d.descriptionBorder) {
        inner.append('rect').attr('class', 'desc-border-rect')
          .attr('rx', d.descriptionBgShape === 'pill' ? 999 : 4)
          .attr('ry', d.descriptionBgShape === 'pill' ? 999 : 4)
          .attr('fill', 'none').attr('stroke', d.descriptionBgColor || '#94a3b8').attr('stroke-width', 1)
      }

      // foreignObject is sized by fitDescBox (below + each tick) to fit the text.
      const descDiv = inner.append('foreignObject')
        .attr('x', 0).attr('y', 0).attr('width', 10).attr('height', 10)
        .append('xhtml:div')
        .style('color', dst.color || '#334155').style('font-size', `${dst.size || 12}px`)
        .style('font-family', dst.font || 'sans-serif').style('font-weight', dst.bold ? 'bold' : 'normal')
        .style('box-sizing', 'border-box').style('word-break', 'break-word')
        .style('white-space', 'pre-wrap').style('user-select', 'none')
      const align = d.descriptionAlign ?? 'center'
      if (vDesc) {
        descDiv.style('writing-mode', 'vertical-rl').style('text-orientation', 'mixed')
          .style('height', '100%').style('line-height', '1.6').style('text-align', align)
      } else {
        descDiv.style('text-align', align).style('line-height', '1.2')
      }
      descDiv.text(d.description!)

      // Resize handle (position/orientation set by fitDescBox: right edge = horizontal
      // width, bottom edge = vertical height). Drag to resize directly on-canvas.
      inner.append('rect').attr('class', 'desc-resize')
        .attr('width', 8).attr('height', 8).attr('rx', 2)
        .attr('fill', '#3b82f6').attr('opacity', 0.55)
        .call(descResizeDrag as any)

      fitDescBox(this, d) // initial fit
    })

    // ── Free-standing notes (type:'note') — reuse the description text-box machinery ──
    const notePreset = (shape?: NoteShape): { bg: string; border: boolean; rx: number } => {
      switch (shape) {
        case 'sticky': return { bg: '#fef9c3', border: false, rx: 4 }
        case 'bubble': return { bg: '#ffffff', border: true, rx: 16 }
        case 'card':   return { bg: '#ffffff', border: true, rx: 6 }
        case 'banner': return { bg: '#e0e7ff', border: false, rx: 2 }
        default:       return { bg: '', border: false, rx: 4 } // plain
      }
    }
    let noteMoved = false
    let lastTapNote: { id: string; t: number } | null = null
    const noteDrag = d3.drag<SVGGElement, PersonNode>()
      .on('start', function(event) { event.sourceEvent.stopPropagation(); noteMoved = false; d3.select(this).style('cursor', 'grabbing') })
      .on('drag', function(event, d) {
        noteMoved = true
        d.x = (d.x ?? 0) + event.dx; d.y = (d.y ?? 0) + event.dy
        d3.select(this).attr('transform', `translate(${snapToGrid(d.x)},${snapToGrid(d.y)})`)
      })
      .on('end', function(_, d) {
        d3.select(this).style('cursor', 'grab')
        if (noteMoved) {
          cbRef.current.onPositionChange(d.id, d.x ?? 0, d.y ?? 0)
        } else if (editable && cbRef.current.onInlineEdit) {
          const now = Date.now()
          if (lastTapNote && lastTapNote.id === d.id && now - lastTapNote.t < DBL_MS) {
            lastTapNote = null
            openEditFromEl((this as SVGGElement).querySelector('foreignObject'), d as unknown as SimNode, 'description')
          } else {
            lastTapNote = { id: d.id, t: now }
          }
        }
      })

    const noteLayer = container.append('g').attr('class', 'note-layer')
    const noteSel = noteLayer.selectAll<SVGGElement, PersonNode>('g.note-g')
      .data(noteData).enter()
      .append('g').attr('class', 'desc-g note-g')
      .attr('transform', d => `translate(${snapToGrid(d.x ?? 400)},${snapToGrid(d.y ?? 300)})`)
      .style('pointer-events', 'all').style('cursor', 'grab')
      .call(noteDrag as any)

    noteSel.each(function(d) {
      const g = d3.select(this)
      const preset = notePreset(d.noteShape)
      const bg = d.descriptionBgColor || preset.bg
      const showBorder = d.descriptionBorder || preset.border
      const nd = d as unknown as SimNode
      const dst = textStyleOf(d, 'description')
      const vDesc = resolveVertical(nd, d.description)
      const inner = g.append('g').attr('class', 'desc-inner')
      const innerTf = boxTransform(d.descriptionRotation, d.descriptionScaleX, d.descriptionScaleY, d.descriptionSkewX)
      if (innerTf) inner.attr('transform', innerTf)
      const bgOpacity = d.descriptionBgOpacity ?? 0.95
      if (isFrameShape(d.noteShape)) {
        // Manga-style frame silhouette (path regenerated in fitDescBox to fit the text).
        inner.append('path').attr('class', 'desc-bg-path')
          .attr('fill', d.descriptionBgColor || '#ffffff').attr('opacity', bgOpacity)
          .attr('stroke', d.descriptionBorder === false ? 'none' : '#1f2937').attr('stroke-width', 1.5)
      } else if (bg) {
        // Speech-bubble tail (吹き出し) — a triangle below the box, sized in fitDescBox.
        if (d.noteShape === 'bubble') {
          inner.append('polygon').attr('class', 'note-tail').attr('fill', bg).attr('opacity', bgOpacity)
        }
        inner.append('rect').attr('class', 'desc-bg-rect')
          .attr('rx', preset.rx).attr('ry', preset.rx).attr('fill', bg).attr('opacity', bgOpacity)
      }
      if (showBorder && !isFrameShape(d.noteShape)) {
        inner.append('rect').attr('class', 'desc-border-rect')
          .attr('rx', preset.rx).attr('ry', preset.rx)
          .attr('fill', 'none').attr('stroke', d.descriptionBgColor || '#94a3b8').attr('stroke-width', 1)
      }
      const div = inner.append('foreignObject').attr('x', 0).attr('y', 0).attr('width', 10).attr('height', 10)
        .append('xhtml:div')
        .style('color', dst.color || '#1f2937').style('font-size', `${dst.size || 14}px`)
        .style('font-family', dst.font || 'sans-serif').style('font-weight', dst.bold ? 'bold' : 'normal')
        .style('box-sizing', 'border-box').style('word-break', 'break-word')
        .style('white-space', 'pre-wrap').style('user-select', 'none')
      const align = d.descriptionAlign ?? 'center'
      if (vDesc) {
        div.style('writing-mode', 'vertical-rl').style('text-orientation', 'mixed')
          .style('height', '100%').style('line-height', '1.6').style('text-align', align)
      } else {
        div.style('text-align', align).style('line-height', '1.3')
      }
      div.text(d.description || '')
      inner.append('rect').attr('class', 'desc-resize')
        .attr('width', 8).attr('height', 8).attr('rx', 2).attr('fill', '#3b82f6').attr('opacity', 0.55)
        .call(descResizeDrag as any)
      fitDescBox(this, d as unknown as SimNode)
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
      'master':       '師匠',
      'disciple':     '弟子',
      'comrade':      '戦友',
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
      // Orthogonal bus (系図 only): parent → drop to shared bus Y → across → drop to child.
      // Siblings share busY so their horizontals form one continuous bar. Each path is still
      // its own element, so clicking a child's drop selects that specific relationship.
      if (orthoBus && d.type === 'parent-child') {
        const group = busGroups.get(d.source.id)
        const rSb = getNodeRadius(d.source)
        const rTb = getNodeRadius(d.target)
        const sx = snapToGrid(d.source.x)
        const sBottom = d.source.y + rSb
        // Topmost child in the group decides the bus line (consistent for all siblings).
        let minChildTop = d.target.y - rTb
        if (group) for (const m of group) minChildTop = Math.min(minChildTop, m.target.y - getNodeRadius(m.target))
        // Only valid when children sit below the parent; otherwise fall through to straight.
        if (minChildTop > sBottom + 4) {
          const busY = snapToGrid(sBottom + (minChildTop - sBottom) * 0.5)
          const cx = snapToGrid(d.target.x)
          const cTop = snapToGrid(d.target.y - rTb)
          const y1b = snapToGrid(sBottom)
          return `M ${sx} ${y1b} L ${sx} ${busY} L ${cx} ${busY} L ${cx} ${cTop}`
        }
      }
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
      updateBoard()
      linkSel.attr('d', buildLinkPath)

      nodeSel.attr('transform', d => `translate(${snapToGrid(d.x)},${snapToGrid(d.y)})`)
      // Parent .node-label follows the node; the inner .name-label-g carries the
      // drag offset via its own transform (set at creation / during drag).
      labelSel.attr('transform', d => `translate(${snapToGrid(d.x)},${snapToGrid(d.y)})`)
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

      // Fit description box + bg/border to the actual text (skip the one being resized).
      descSel.each(function(dd) { if (dd.id !== descResizingId) fitDescBox(this, dd) })

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
      cbRef.current.onAddPerson(x, y)
    })

    if (!initialZoomApplied.current) {
      // Restore the saved zoom/pan if the page has one; otherwise fit-to-content.
      const t = initialTransform && Number.isFinite(initialTransform.k)
        ? d3.zoomIdentity.translate(initialTransform.x, initialTransform.y).scale(initialTransform.k)
        : computeFit(dimensions.width, dimensions.height)
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
    // Callbacks are read via cbRef (stable) so they're intentionally NOT deps — otherwise
    // a parent re-render (e.g. Save) with new callback identities rebuilds the canvas (flash).
  }, [persons, relationships, dimensions, showGrid, gridSize, selectedNodeId,
    computeFit, initialTransform, background, verticalText, editable, lastLayoutKind, edgeStyle])

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
      {/* Background layer — behind the SVG. Its own opacity fades the color+image
          without affecting the chart drawn on top. */}
      {(background || backgroundImage) && (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundColor: background || undefined,
            backgroundImage: backgroundImage ? `url("${backgroundImage}")` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: backgroundOpacity ?? 1,
          }}
        />
      )}
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

      <div className="absolute top-2 left-14 z-10 flex items-center gap-1 bg-white/90 px-2 py-1 rounded shadow text-sm text-gray-700"
        title="登場人物の総数（メモ・結婚ノードを除く）">
        <UsersIcon className="w-4 h-4 text-gray-500" aria-hidden="true" />
        <span className="font-semibold">{persons.filter(p => p.type !== 'union' && p.type !== 'note').length}</span>
        <span>人</span>
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
        <div className="flex items-center rounded border border-gray-300 overflow-hidden">
          <button onClick={handleAutoLayout} title="選択したモードで自動整列"
            className="px-2 py-1 text-sm bg-white text-gray-700 hover:bg-gray-50 border-r border-gray-300">
            Auto Layout
          </button>
          <select value={layoutMode}
            onChange={e => { const m = e.target.value as LayoutMode; setLayoutMode(m); runAutoLayout(m) }}
            title="レイアウトモード" className="text-sm px-1 py-1 bg-white text-gray-700 focus:outline-none">
            <option value="auto">自動</option>
            <option value="force">関係図(集約)</option>
            <option value="tidy">系図(構造)</option>
            <option value="timeline">年表(timeline)</option>
          </select>
        </div>
        {(layoutMode === 'tidy' || lastLayoutKind === 'tidy') && (
          <label className="flex items-center gap-1 text-sm text-gray-700" title="親子の配線（系図のみ）：直線／直交バス">
            <span>配線</span>
            <select value={edgeStyle} onChange={e => setEdgeStyle(e.target.value as 'straight' | 'ortho')}
              className="rounded border border-gray-300 text-sm px-1 py-0.5">
              <option value="straight">直線</option>
              <option value="ortho">直交</option>
            </select>
          </label>
        )}
        <label className="flex items-center gap-1 text-sm text-gray-700" title="ノードの間隔（座標）を拡大／縮小">
          <span>間隔</span>
          <input type="range" min={0.4} max={2.5} step={0.05} value={spacing}
            onChange={e => setSpacing(Number(e.target.value))}
            onMouseUp={() => applySpacing(spacing)} onTouchEnd={() => applySpacing(spacing)}
            className="w-24" />
        </label>
      </div>

      <svg ref={svgRef} width={dimensions.width} height={dimensions.height}
        className="fc-canvas-svg cursor-move relative z-[1]" />
    </div>
  )
})

export default DynastyNetwork
