import { useEffect, useState, useCallback, useRef } from 'react'
import { useDataContext } from '@/context/DataContext'
import DynastyNetwork, { DynastyNetworkHandle } from '@/components/canvas/DynastyNetwork'
import { NodeCard } from '@/components/canvas/NodeCard'
import { EdgeCard } from '@/components/editors/EdgeCard'
import { UnionCard } from '@/components/editors/UnionCard'
import { RelationshipTypeDialog } from '@/components/editors/RelationshipTypeDialog'
import ChartSettingsDialog from '@/app/ChartSettingsDialog'
import { PersonNode, Relationship } from '@/types/charts'
import {
  ArrowLeftIcon,
  CloudArrowDownIcon,
  EyeIcon,
  TrashIcon,
  ArrowPathIcon,
  PlusIcon,
  ArrowLeftCircleIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  PrinterIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'

// Generate a PNG thumbnail blob from a chart SVG element.
// When opts.viewBox is provided, the thumbnail captures the CURRENT VISIBLE viewport
// (fills the A4 canvas via "xMidYMid slice", cropping if needed — large charts show
// a readable part rather than everything shrunk). Without viewBox, falls back to the
// full-content bbox approach. Returns null on any failure, including tainted-canvas
// errors from external <image> hrefs.
// Load a (cross-origin, CORS-enabled) image and convert it to a data: URL via a
// canvas — no fetch, no Blob. Requires the image host to send CORS headers so the
// canvas isn't tainted; returns null (leaving a silhouette) if it can't be read.
const XLINK = 'http://www.w3.org/1999/xlink'
function imageUrlToDataUrl(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const cx = c.getContext('2d')
        if (!cx) { resolve(null); return }
        cx.drawImage(img, 0, 0)
        resolve(c.toDataURL('image/png'))
      } catch {
        resolve(null) // tainted (CORS missing) → skip, keep silhouette
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

// SVG rasterized via <img src="data:svg…"> won't load external hrefs, so person
// photos vanish and every node shows the same silhouette. Convert each external
// <image> to a data: URL (canvas, not blob) so the SVG is self-contained.
async function inlineSvgImages(svg: SVGSVGElement): Promise<void> {
  const images = Array.from(svg.querySelectorAll('image'))
  await Promise.all(
    images.map(async (im) => {
      const href = im.getAttribute('href') || im.getAttributeNS(XLINK, 'href')
      if (!href || href.startsWith('data:')) return
      const dataUrl = await imageUrlToDataUrl(href)
      if (dataUrl) {
        im.setAttribute('href', dataUrl)
        im.removeAttributeNS(XLINK, 'href')
      }
    }),
  )
}

async function generateThumbnailBlob(
  svgEl: SVGSVGElement,
  opts?: { dpi?: number; background?: string; viewBox?: { x: number; y: number; w: number; h: number } },
): Promise<Blob | null> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  const cloneContainer = clone.querySelector('.zoom-container') as SVGGElement | null

  if (opts?.viewBox) {
    // Capture the currently-visible viewport rect in content coordinates.
    const { x, y, w, h } = opts.viewBox
    clone.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)
    // "slice" fills the A4 canvas, cropping to the A4 aspect — shows a readable
    // section of large charts instead of shrinking everything to fit.
    clone.setAttribute('preserveAspectRatio', 'xMidYMid slice')
    if (cloneContainer) cloneContainer.removeAttribute('transform')
    cloneContainer?.querySelector(':scope > .grid-bg')?.remove()
    cloneContainer?.querySelector(':scope > .board-border')?.remove()
  } else {
    // Fallback: reframe to the full content bounding box.
    const containerG = svgEl.querySelector('.zoom-container') as SVGGElement | null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    if (containerG) {
      containerG.querySelectorAll(':scope > g').forEach((g) => {
        if ((g as SVGGElement).classList.contains('grid')) return
        try {
          const b = (g as SVGGElement).getBBox()
          if (b.width === 0 && b.height === 0) return
          minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
          maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
        } catch { /* getBBox may throw for empty/unrendered groups */ }
      })
    }
    if (!Number.isFinite(minX)) return null
    const m = 20
    clone.setAttribute('viewBox', `${minX - m} ${minY - m} ${(maxX - minX) + m * 2} ${(maxY - minY) + m * 2}`)
    clone.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    if (cloneContainer) cloneContainer.removeAttribute('transform')
    cloneContainer?.querySelector(':scope > .grid-bg')?.remove()
    cloneContainer?.querySelector(':scope > .board-border')?.remove()
  }

  // A4 landscape (297×210mm) rasterized at the given DPI (default 150).
  // 150 DPI → 1754×1240; raise DPI for sharper output.
  const dpi = opts?.dpi && opts.dpi > 0 ? opts.dpi : 150
  const width = Math.round((297 / 25.4) * dpi)
  const height = Math.round((210 / 25.4) * dpi)
  // Supersample: rasterize the SVG at SS× the output size, then high-quality
  // downscale. SVG <image> (person photos) are otherwise decoded at their on-screen
  // size — soft when the viewport crop is scaled up. Decoding at 2× then shrinking
  // samples the source photos at higher resolution → sharper faces. Output stays A4@DPI.
  const SS = 2
  clone.setAttribute('width', String(width * SS))
  clone.setAttribute('height', String(height * SS))

  // Inline external person photos (canvas→dataURL) so they render during rasterization.
  await inlineSvgImages(clone)

  const svgStr = new XMLSerializer().serializeToString(clone)
  // base64-encode safely for non-ASCII SVG content (CJK labels, etc.)
  const svgB64 = btoa(unescape(encodeURIComponent(svgStr)))
  const dataUrl = `data:image/svg+xml;base64,${svgB64}`

  return new Promise<Blob | null>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(null); return }
      try {
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        // Use the page's configured background (solid color) if any; else white paper.
        const bg = opts?.background && !/url\(/i.test(opts.background) && opts.background !== 'transparent'
          ? opts.background
          : '#ffffff'
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, width, height)
        // img intrinsic size is SS×; drawing into the A4 canvas downscales it.
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob((blob) => resolve(blob), 'image/png')
      } catch {
        // Tainted canvas: external-URL <image> hrefs prevent toBlob — skip thumbnail
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

export interface FamilyChartEditorProps {
  id: string
  mode?: 'edit' | 'view'
  onBack: () => void
  onOpenView: (id: string) => void
  onOpenEdit: (id: string) => void
}

export default function FamilyChartEditor({
  id,
  mode,
  onBack,
  onOpenView,
  onOpenEdit,
}: FamilyChartEditorProps) {
  // `view` = pure read-only (from the list); `preview` = in-editor preview (returnable).
  // Preview is a local toggle so it never leaves the edit route; view has no way back to edit.
  const [previewing, setPreviewing] = useState(false)
  const isViewMode = mode === 'view' || previewing

  const {
    persons,
    relationships,
    episodes,
    currentPage,
    selectedNode,
    selectedRelationship,
    loadPage,
    savePage,
    addPerson,
    updatePerson,
    deletePerson,
    dissolveUnion,
    updatePersonPosition,
    updatePersonsBatch,
    addRelationship,
    updateRelationship,
    deleteRelationship,
    addEpisode,
    updateEpisode,
    deleteEpisode,
    setSelectedNode,
    setSelectedRelationship,
    clearPage,
    uploadFile,
    uploadThumbnail,
    background,
    backgroundImage,
    backgroundOpacity,
    verticalText,
    viewport,
    setBackground,
    setBackgroundImage,
    setBackgroundOpacity,
    setVerticalText,
    dpi,
    setDpi,
    thumbnailDpi,
  } = useDataContext()

  const [nodeCardPos, setNodeCardPos] = useState({ x: 200, y: 100 })
  const [edgeCardPos, setEdgeCardPos] = useState({ x: 400, y: 200 })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsZoom, setSettingsZoom] = useState(1)

  // Connect mode state
  const [connectState, setConnectState] = useState<{
    active: boolean
    sourceId: string | null
  }>({ active: false, sourceId: null })

  // Relationship type dialog
  const [pendingConnect, setPendingConnect] = useState<{
    sourceId: string
    targetId: string
    x?: number
    y?: number
  } | null>(null)

  // Ctrl+click connect: first node stored here until second node picked
  const [ctrlSource, setCtrlSource] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const netRef = useRef<DynastyNetworkHandle>(null)

  useEffect(() => {
    if (id) {
      loadPage(id).then((page) => {
        if (!page) onBack()
      })
    }
  }, [id])

  // Global keyboard: Esc closes any open card/dialog; Delete/Backspace removes the selection
  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      const n = el as HTMLElement | null
      if (!n) return false
      const tag = n.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCtrlSource(null)
        setPendingConnect(null)
        setSelectedNode(null)
        setSelectedRelationship(null)
        setConnectState({ active: false, sourceId: null })
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditable(e.target) && !isViewMode) {
        if (selectedNode) {
          e.preventDefault()
          deletePerson(selectedNode.id)
          setSelectedNode(null)
        } else if (selectedRelationship) {
          e.preventDefault()
          deleteRelationship(selectedRelationship.id)
          setSelectedRelationship(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isViewMode, selectedNode, selectedRelationship, deletePerson, deleteRelationship,
    setSelectedNode, setSelectedRelationship])

  const handleNodeClick = useCallback(
    (node: PersonNode, screenX: number, screenY: number) => {
      setCtrlSource(null) // a plain click cancels any pending Ctrl-connect selection
      if (connectState.active && connectState.sourceId && node.id !== connectState.sourceId) {
        setPendingConnect({ sourceId: connectState.sourceId, targetId: node.id })
        setConnectState({ active: false, sourceId: null })
        return
      }
      setSelectedNode(node)
      setSelectedRelationship(null)
      // Position card near node, clamped
      const vw = window.innerWidth
      const vh = window.innerHeight
      setNodeCardPos({
        x: Math.min(screenX + 20, vw - 320),
        y: Math.min(Math.max(screenY - 50, 10), vh - 400),
      })
    },
    [connectState, setSelectedNode, setSelectedRelationship]
  )

  const handleEdgeClick = useCallback(
    (rel: Relationship, screenX: number, screenY: number) => {
      // A 'partner' edge belongs to a union node — open the UnionCard (A—B) instead
      if (rel.type === 'partner') {
        const union = persons.find((p) => p.id === rel.target && p.type === 'union')
        if (union) {
          setSelectedRelationship(null)
          setSelectedNode(union)
          setNodeCardPos({
            x: Math.min(screenX + 20, window.innerWidth - 300),
            y: Math.min(Math.max(screenY - 40, 10), window.innerHeight - 320),
          })
          return
        }
      }
      setSelectedRelationship(rel)
      setSelectedNode(null)
      setEdgeCardPos({
        x: Math.min(screenX, window.innerWidth - 280),
        y: Math.min(screenY, window.innerHeight - 300),
      })
    },
    [persons, setSelectedRelationship, setSelectedNode]
  )

  const handleConnectRequest = useCallback((sourceId: string, targetId: string) => {
    setPendingConnect({ sourceId, targetId })
  }, [])

  // Ctrl+click: pick node A, then node B → open relation dialog near the second click
  const handleNodeCtrlClick = useCallback((nodeId: string, screenX: number, screenY: number) => {
    setCtrlSource((prev) => {
      if (!prev) return nodeId              // first pick
      if (prev === nodeId) return null      // same node → deselect
      setPendingConnect({ sourceId: prev, targetId: nodeId, x: screenX, y: screenY })
      return null                           // second pick → open dialog, clear
    })
  }, [])

  const handleAddPerson = useCallback(
    (x: number, y: number) => {
      if (isViewMode) return
      const newNode = addPerson({ x, y, fx: x, fy: y })
      setSelectedNode(newNode)
      setNodeCardPos({
        x: Math.min(x + 60, window.innerWidth - 320),
        y: Math.min(Math.max(y - 50, 10), window.innerHeight - 400),
      })
    },
    [isViewMode, addPerson, setSelectedNode]
  )

  const handleExport = () => {
    if (!currentPage) return
    const exportData = {
      ...currentPage,
      chartProps: { ...currentPage.chartProps, persons, relationships },
    }
    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(currentPage.title || 'chart').replace(/[^a-z0-9]/gi, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSave = async () => {
    if (isViewMode) return
    setSaving(true)

    // Best-effort thumbnail generation: never blocks the save on failure.
    let thumbnailPatch: { thumbnail?: string } = {}
    if (uploadThumbnail && currentPage?.id) {
      try {
        const svgEl = containerRef.current?.querySelector('svg') as SVGSVGElement | null
        if (svgEl) {
          // Capture the currently-visible viewport rect; fall back to bbox if unavailable.
          const visibleRect = netRef.current?.getVisibleRect()
          const blob = await generateThumbnailBlob(svgEl, {
            dpi: dpi ?? thumbnailDpi,
            background,
            ...(visibleRect ? { viewBox: visibleRect } : {}),
          })
          if (blob) {
            const url = await uploadThumbnail(currentPage.id, blob)
            if (url) thumbnailPatch = { thumbnail: url }
          }
        }
      } catch (err) {
        console.warn('[chart] thumbnail generation/upload failed:', err)
      }
    }

    // Persist the current zoom/pan so the page reloads at the same view.
    const vp = netRef.current?.getViewport()
    const result = await savePage({
      ...thumbnailPatch,
      ...(vp ? { viewport: vp } : {}),
      ...(dpi !== undefined ? { dpi } : {}),
    })
    setSaveMsg(result ? 'Saved!' : 'Save failed')
    setSaving(false)
    setTimeout(() => setSaveMsg(null), 2500)
  }

  const handleClear = () => {
    if (window.confirm('Clear all data? This cannot be undone.')) clearPage()
  }

  const [reloading, setReloading] = useState(false)
  const handleReload = async () => {
    if (!id) return
    if (!window.confirm('保存前の変更は破棄され、最後に保存した内容を再読み込みします。よろしいですか？')) return
    setReloading(true)
    setSelectedNode(null)
    setSelectedRelationship(null)
    await loadPage(id)
    setReloading(false)
  }

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      // Accept both the exported page shape ({ chartProps: { persons, relationships } })
      // and a flat shape ({ persons, relationships }). Import MERGES into the current chart.
      const src = parsed.chartProps ?? parsed
      const persons_ = Array.isArray(src.persons) ? src.persons : []
      const rels_ = Array.isArray(src.relationships) ? src.relationships : []

      if (persons_.length === 0 && rels_.length === 0) {
        alert('インポート対象が見つかりません。persons / relationships を含む JSON を選んでください（docs/import-schema.md 参照）。')
        return
      }

      // Offset the imported block so it lands to the RIGHT of existing nodes (no overlap),
      // while preserving the imported layout's internal relative positions.
      const existingXs = persons.map((p) => p.x).filter((v): v is number => typeof v === 'number')
      const baseX = existingXs.length ? Math.max(...existingXs) + 220 : 120
      const impXs = persons_
        .map((p: Record<string, unknown>) => (typeof p.x === 'number' ? (p.x as number) : null))
        .filter((v: number | null): v is number => v != null)
      const impMinX = impXs.length ? Math.min(...impXs) : 0
      const dx = baseX - impMinX

      const idMap = new Map<string, string>()   // old id / name → new id
      persons_.forEach((p: Record<string, unknown>, i: number) => {
        if (!p.name && !p.id) return
        const x = (typeof p.x === 'number' ? p.x : 200 + (i % 5) * 180) + dx
        const y = (typeof p.y === 'number' ? p.y : 100 + Math.floor(i / 5) * 180)
        const node = addPerson({ ...p, x, y, fx: x, fy: y })
        if (p.id) idMap.set(p.id as string, node.id)
        if (p.name) idMap.set(p.name as string, node.id)
      })
      for (const r of rels_) {
        const s = idMap.get(r.source) || r.source
        const t = idMap.get(r.target) || r.target
        addRelationship({ ...r, source: s, target: t })
      }
      alert(`インポート完了: ${persons_.length}人 / ${rels_.length}関係 を追加しました。`)
    } catch {
      alert('Import failed: invalid JSON. See docs/import-schema.md for the format.')
    }
    e.target.value = ''
  }, [addPerson, addRelationship])

  const handlePdfExport = useCallback(() => {
    const svgEl = containerRef.current?.querySelector('svg') as SVGSVGElement | null
    if (!svgEl) return

    // Clone the SVG and reframe it to the content's bounding box so it fits & centers on the page.
    const clone = svgEl.cloneNode(true) as SVGSVGElement
    const containerG = svgEl.querySelector('.zoom-container') as SVGGElement | null
    const cloneContainer = clone.querySelector('.zoom-container') as SVGGElement | null

    // Union bounding box of all content groups EXCEPT the grid (in container-local coordinates).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    if (containerG) {
      containerG.querySelectorAll(':scope > g').forEach((g) => {
        if ((g as SVGGElement).classList.contains('grid')) return
        try {
          const b = (g as SVGGElement).getBBox()
          if (b.width === 0 && b.height === 0) return
          minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
          maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
        } catch { /* getBBox can throw for empty/unrendered groups */ }
      })
    }

    if (Number.isFinite(minX)) {
      const m = 40
      const vx = minX - m, vy = minY - m
      const vw = (maxX - minX) + m * 2, vh = (maxY - minY) + m * 2
      clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`)
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet')
      clone.removeAttribute('width')
      clone.removeAttribute('height')
      // Drop the pan/zoom transform and the grid/board so the print shows only the framed content.
      if (cloneContainer) cloneContainer.removeAttribute('transform')
      cloneContainer?.querySelector(':scope > .grid-bg')?.remove()
      cloneContainer?.querySelector(':scope > .board-border')?.remove()

      // The on-screen background is a DOM layer behind the SVG, so it isn't part of
      // the clone. Re-create it inside the printed SVG as a rect (color) + image,
      // sized to the printed frame, so PDF output matches the canvas background.
      if (background || backgroundImage) {
        const NS = 'http://www.w3.org/2000/svg'
        const bgGroup = document.createElementNS(NS, 'g')
        bgGroup.setAttribute('opacity', String(backgroundOpacity ?? 1))
        if (background) {
          const rect = document.createElementNS(NS, 'rect')
          rect.setAttribute('x', String(vx)); rect.setAttribute('y', String(vy))
          rect.setAttribute('width', String(vw)); rect.setAttribute('height', String(vh))
          rect.setAttribute('fill', background)
          bgGroup.appendChild(rect)
        }
        if (backgroundImage) {
          const img = document.createElementNS(NS, 'image')
          img.setAttribute('href', backgroundImage)
          img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', backgroundImage)
          img.setAttribute('x', String(vx)); img.setAttribute('y', String(vy))
          img.setAttribute('width', String(vw)); img.setAttribute('height', String(vh))
          img.setAttribute('preserveAspectRatio', 'xMidYMid slice') // cover
          bgGroup.appendChild(img)
        }
        if (cloneContainer) clone.insertBefore(bgGroup, cloneContainer)
        else clone.insertBefore(bgGroup, clone.firstChild)
      }
    }

    const svgStr = new XMLSerializer().serializeToString(clone)
    const safeTitle = (currentPage?.title || 'Chart').replace(/[<>&"]/g, c =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] ?? c))
    const html = [
      '<!DOCTYPE html><html><head>',
      `<meta charset="utf-8"><title>${safeTitle}</title>`,
      '<link rel="preconnect" href="https://fonts.googleapis.com" />',
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />',
      '<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&family=Noto+Sans+JP:wght@400;700&family=Noto+Serif+SC:wght@400;700&family=Ma+Shan+Zheng&family=ZCOOL+QingKe+HuangYou&display=swap" rel="stylesheet" />',
      '<style>',
      '@page { size: A4 landscape; margin: 10mm; }',
      'html,body{margin:0;padding:0;background:#fff;height:100%}',
      'body{display:flex;align-items:center;justify-content:center}',
      'svg{width:100%;height:100%;max-height:100vh;display:block}',
      '@media print{body{height:100vh}}',
      '</style>',
      '</head><body>',
      svgStr,
      '</body></html>',
    ].join('\n')
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) {
      w.addEventListener('load', () => {
        setTimeout(() => { w.print(); URL.revokeObjectURL(url) }, 800)
      })
    } else {
      URL.revokeObjectURL(url)
    }
  }, [currentPage, background, backgroundImage, backgroundOpacity])

  const handleRelConfirm = (relData: Partial<Relationship>, useUnionNode: boolean) => {
    if (!pendingConnect) return
    if (useUnionNode) {
      const srcNode = persons.find(p => p.id === pendingConnect.sourceId)
      const tgtNode = persons.find(p => p.id === pendingConnect.targetId)
      const mx = ((srcNode?.x ?? 300) + (tgtNode?.x ?? 300)) / 2
      const my = ((srcNode?.y ?? 300) + (tgtNode?.y ?? 300)) / 2
      const unionNode = addPerson({
        x: mx, y: my, fx: mx, fy: my,
        type: 'union', name: '',
        shape: 'circle', nodeSize: 12,
        marriage: {
          start: relData.start, end: relData.end, label: relData.label,
          type: relData.type ?? 'marriage',
        },
      })
      addRelationship({ type: 'partner', source: pendingConnect.sourceId, target: unionNode.id })
      addRelationship({ type: 'partner', source: pendingConnect.targetId, target: unionNode.id })
    } else {
      addRelationship({
        ...relData,
        source: relData.source ?? pendingConnect.sourceId,
        target: relData.target ?? pendingConnect.targetId,
      })
    }
    setPendingConnect(null)
  }

  const handleStartConnect = useCallback(() => {
    if (!selectedNode) return
    setConnectState({ active: true, sourceId: selectedNode.id })
    setSelectedNode(null)
  }, [selectedNode, setSelectedNode])

  // EdgeCard union checkbox: replace a direct A—B edge with a union node + 2 partner links
  const handleConvertToUnion = useCallback((rel: Relationship) => {
    const srcNode = persons.find((p) => p.id === rel.source)
    const tgtNode = persons.find((p) => p.id === rel.target)
    const mx = ((srcNode?.x ?? 300) + (tgtNode?.x ?? 300)) / 2
    const my = ((srcNode?.y ?? 300) + (tgtNode?.y ?? 300)) / 2
    const unionNode = addPerson({
      x: mx, y: my, fx: mx, fy: my,
      type: 'union', name: '',
      shape: 'circle', nodeSize: 12,
      marriage: {
        start: rel.start, end: rel.end, label: rel.label,
        type: rel.type ?? 'marriage',
      },
    })
    addRelationship({ type: 'partner', source: rel.source, target: unionNode.id })
    addRelationship({ type: 'partner', source: rel.target, target: unionNode.id })
    deleteRelationship(rel.id)
    setSelectedRelationship(null)
  }, [persons, addPerson, addRelationship, deleteRelationship, setSelectedRelationship])

  return (
    // Fill the parent (h-full/w-full) rather than the viewport, so the editor fits both
    // the standalone demo (wrapped in a full-viewport box) and the host app (wrapped in a
    // box sized to the area below the site menubar). Prevents the bottom FAB going off-screen.
    <div className="w-full h-full flex flex-col overflow-hidden bg-gray-50">
      {/* Top toolbar */}
      {!isViewMode && (
        <header className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 bg-white border-b border-gray-200 shadow-sm z-20 flex-shrink-0">
          <button
            onClick={() => onBack()}
            className="p-1.5 md:p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex-shrink-0"
            title="Back to list"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-800 truncate">
              {currentPage?.title || 'Chart Editor'}
            </h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            title="Save"
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {saving ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <CloudArrowDownIcon className="h-4 w-4" />
            )}
            <span className="hidden md:inline">{saveMsg ?? 'Save'}</span>
          </button>
          <button
            onClick={() => setPreviewing(true)}
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm"
            title="Preview (check the result, then return to editing)"
          >
            <EyeIcon className="h-4 w-4" />
            <span className="hidden md:inline">Preview</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200"
            title="Export as JSON"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            <span className="hidden md:inline">Export</span>
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200"
            title="Import JSON (see docs/import-schema.md)"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            <span className="hidden md:inline">Import</span>
          </button>
          <button
            onClick={() => {
              setSettingsZoom(netRef.current?.getViewport().k ?? 1)
              setSettingsOpen(true)
            }}
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200"
            title="設定（背景・DPI・ビューポート）"
          >
            <Cog6ToothIcon className="h-4 w-4" />
            <span className="hidden md:inline">設定</span>
          </button>
          <button
            onClick={handlePdfExport}
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200"
            title="Print / Export as PDF"
          >
            <PrinterIcon className="h-4 w-4" />
            <span className="hidden md:inline">PDF</span>
          </button>
          <button
            onClick={handleReload}
            disabled={reloading}
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200 disabled:opacity-60"
            title="再読み込み（保存済みの内容に戻す）"
          >
            <ArrowPathIcon className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">Reload</span>
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 md:p-2 rounded-lg text-red-500 hover:bg-red-50 flex-shrink-0"
            title="Clear all"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImport}
          />
        </header>
      )}

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <DynastyNetwork
          ref={netRef}
          initialTransform={viewport ?? null}
          background={background}
          backgroundImage={backgroundImage}
          backgroundOpacity={backgroundOpacity}
          verticalText={verticalText}
          persons={persons}
          relationships={relationships}
          selectedNodeId={selectedNode?.id ?? null}
          connectSourceId={ctrlSource}
          onNodeClick={handleNodeClick}
          onNodeCtrlClick={handleNodeCtrlClick}
          onEdgeClick={handleEdgeClick}
          onConnectRequest={handleConnectRequest}
          onAddPerson={handleAddPerson}
          onPositionChange={updatePersonPosition}
          onBatchPositionChange={updatePersonsBatch}
          onNodeUpdate={updatePerson}
          connectMode={connectState.active}
        />

        {/* Connect mode overlay */}
        {connectState.active && (
          <div
            className="absolute inset-0 z-10 pointer-events-none"
            style={{ cursor: 'crosshair' }}
          >
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-sm px-4 py-2 rounded-full shadow pointer-events-auto">
              Click a node to connect — or{' '}
              <button
                onClick={() => setConnectState({ active: false, sourceId: null })}
                className="underline ml-1"
              >
                Cancel (Esc)
              </button>
            </div>
          </div>
        )}

        {/* Floating UnionCard (auxiliary union node) */}
        {selectedNode && selectedNode.type === 'union' && !isViewMode && (
          <UnionCard
            union={selectedNode}
            partners={relationships
              .filter((r) => r.type === 'partner' && r.target === selectedNode.id)
              .map((r) => persons.find((p) => p.id === r.source))
              .filter((p): p is PersonNode => !!p)}
            children={relationships
              .filter((r) => r.type === 'parent-child' && r.source === selectedNode.id)
              .map((r) => persons.find((p) => p.id === r.target))
              .filter((p): p is PersonNode => !!p)}
            position={nodeCardPos}
            onUpdate={(nid, updates) => updatePerson(nid, updates)}
            onDissolve={(uid) => { dissolveUnion(uid); setSelectedNode(null) }}
            onDelete={(uid) => { deletePerson(uid); setSelectedNode(null) }}
            onClose={() => setSelectedNode(null)}
          />
        )}

        {/* Floating NodeCard */}
        {selectedNode && selectedNode.type !== 'union' && !isViewMode && (
          <NodeCard
            node={selectedNode}
            position={nodeCardPos}
            relationships={relationships}
            persons={persons}
            episodes={episodes}
            onUpdate={(nid, updates) => updatePerson(nid, updates)}
            onClose={() => setSelectedNode(null)}
            onDelete={(nid) => { deletePerson(nid); setSelectedNode(null) }}
            onUploadFile={uploadFile}
            onStartConnect={handleStartConnect}
            onRemoveRelationship={(relId) => deleteRelationship(relId)}
            onAddEpisode={addEpisode}
            onUpdateEpisode={updateEpisode}
            onDeleteEpisode={deleteEpisode}
          />
        )}

        {/* Floating EdgeCard */}
        {selectedRelationship && !isViewMode && (
          <EdgeCard
            relationship={selectedRelationship}
            persons={persons}
            position={edgeCardPos}
            onUpdate={(rid, updates) => updateRelationship(rid, updates)}
            onDelete={(rid) => { deleteRelationship(rid); setSelectedRelationship(null) }}
            onConvertToUnion={handleConvertToUnion}
            onClose={() => setSelectedRelationship(null)}
          />
        )}

        {/* Add person FAB */}
        {!isViewMode && (
          <button
            onClick={() => netRef.current?.addPersonAtCenter()}
            className="absolute bottom-6 left-6 z-20 w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
            title="Add person (or double-click canvas)"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
        )}

        {/* Return-to-edit button — only during in-editor preview, NOT in pure view mode */}
        {previewing && (
          <button
            onClick={() => setPreviewing(false)}
            className="absolute bottom-8 right-8 z-20 flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg"
          >
            <ArrowLeftCircleIcon className="h-5 w-5" />
            Edit Mode
          </button>
        )}

        {/* Relationship type dialog — inside canvas container like NodeCard */}
        {pendingConnect && (
          <RelationshipTypeDialog
            sourceId={pendingConnect.sourceId}
            targetId={pendingConnect.targetId}
            persons={persons}
            initialX={pendingConnect.x}
            initialY={pendingConnect.y}
            onConfirm={handleRelConfirm}
            onCancel={() => setPendingConnect(null)}
          />
        )}
      </div>

      {/* Settings dialog — portal-level (fixed), outside canvas div */}
      <ChartSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        background={background}
        onBackgroundChange={setBackground}
        backgroundImage={backgroundImage}
        onBackgroundImageChange={setBackgroundImage}
        backgroundOpacity={backgroundOpacity ?? 1}
        onBackgroundOpacityChange={setBackgroundOpacity}
        uploadFile={uploadFile}
        verticalText={verticalText ?? 'off'}
        onVerticalTextChange={setVerticalText}
        dpi={dpi ?? thumbnailDpi ?? 150}
        onDpiChange={setDpi}
        zoom={settingsZoom}
        onZoomChange={(k) => {
          setSettingsZoom(k)
          netRef.current?.setZoom(k)
        }}
        onFit={() => netRef.current?.fitToContent()}
      />
    </div>
  )
}
