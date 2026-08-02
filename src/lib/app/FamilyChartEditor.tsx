import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import { useDataContext } from '@/context/DataContext'
import DynastyNetwork, { DynastyNetworkHandle, InlineEditRequest } from '@/components/canvas/DynastyNetwork'
import { NodeCard } from '@/components/canvas/NodeCard'
import { EdgeCard } from '@/components/editors/EdgeCard'
import { UnionCard } from '@/components/editors/UnionCard'
import { RelationshipTypeDialog } from '@/components/editors/RelationshipTypeDialog'
import ChartSettingsDialog from '@/app/ChartSettingsDialog'
import ColorPickerPopover from '@/components/ui/ColorPickerPopover'
import { FontSelector } from '@/components/ui/FontSelector'
import { PersonNode, Relationship, TextStyle, DrawTool } from '@/types/charts'
import {
  PencilIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
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
  Bars3BottomLeftIcon,
  Bars3Icon,
  Bars3BottomRightIcon,
  DocumentPlusIcon,
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

// HTML overlay editor for in-place (double-click) name/description editing. Lives in
// React (not the D3 SVG) so it survives canvas re-renders. Positioned in px over the
// canvas container using the rect the canvas computed for the double-clicked label.
type TextAlign = 'left' | 'center' | 'right'

// Shared in-place text editor with a floating toolbar (font size / bold / color /
// font family / background / alignment / rotation). Style changes persist immediately
// via onSettings; the text value commits via onCommit (Enter / focus leaving the editor).
function InlineEditOverlay({
  req, node, onCommit, onSettings, onCancel, onDelete,
}: {
  req: InlineEditRequest
  node?: PersonNode
  onCommit: (value: string) => void
  onSettings: (patch: Partial<PersonNode>) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const committed = useRef(false)
  const isDesc = req.field === 'description'
  // Per-field style object (falls back to node-level defaults) — see TextStyle.
  const styleKey: 'nameStyle' | 'titleStyle' | 'descriptionStyle' =
    req.field === 'name' ? 'nameStyle' : req.field === 'title' ? 'titleStyle' : 'descriptionStyle'
  const fStyle = node?.[styleKey]

  const [val, setVal] = useState(req.value)
  const [align, setAlign] = useState<TextAlign>(req.align)
  const [bold, setBold] = useState(fStyle?.bold ?? (node?.labelBold !== false))
  const [color, setColor] = useState(fStyle?.color ?? node?.labelColor ?? req.color)
  const [font, setFont] = useState(fStyle?.fontFamily ?? node?.fontFamily ?? req.fontFamily)
  const [size, setSize] = useState(fStyle?.fontSize ?? node?.labelFontSize ?? 13)
  const [bg, setBg] = useState((isDesc ? node?.descriptionBgColor : node?.labelBgColor) || '')
  const [rot, setRot] = useState((isDesc ? node?.descriptionRotation : node?.labelRotation) || 0)
  const [skew, setSkew] = useState((isDesc ? node?.descriptionSkewX : node?.labelSkewX) || 0)
  const [scaleX, setScaleX] = useState((isDesc ? node?.descriptionScaleX : node?.labelScaleX) ?? 1)
  const [scaleY, setScaleY] = useState((isDesc ? node?.descriptionScaleY : node?.labelScaleY) ?? 1)
  const [picker, setPicker] = useState<null | 'text' | 'bg' | 'deform'>(null)
  const isNote = node?.type === 'note'
  const [noteShape, setNoteShape] = useState(node?.noteShape ?? 'sticky')
  const [vertOn, setVertOn] = useState(node?.vertical === 'on')
  const [bgOpacity, setBgOpacity] = useState(node?.descriptionBgOpacity ?? 0.95)

  useEffect(() => { const el = inputRef.current; if (el) { el.focus(); el.select?.() } }, [])

  const commit = () => { if (committed.current) return; committed.current = true; onCommit(val) }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); committed.current = true; onCancel() }
    else if (e.key === 'Enter' && (!isDesc || e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() }
  }
  // Commit only when focus leaves the WHOLE editor (input + toolbar + color popovers).
  const onWrapBlur = (e: React.FocusEvent) => {
    if (!wrapRef.current?.contains(e.relatedTarget as Node)) commit()
  }

  // Style edits write to THIS field's style object (merged), so name/title/description
  // are styled independently; unset props fall back to the node-level defaults.
  const writeStyle = (p: Partial<TextStyle>) => {
    const cur = node?.[styleKey] ?? {}
    onSettings({ [styleKey]: { ...cur, ...p } })
  }
  const setSizeBy = (d: number) => { const s = Math.max(8, Math.min(48, size + d)); setSize(s); writeStyle({ fontSize: s }) }
  const toggleBold = () => { const b = !bold; setBold(b); writeStyle({ bold: b }) }
  const pickColor = (c: string) => { setColor(c); writeStyle({ color: c || undefined }) }
  const pickFont = (f: string) => { setFont(f); writeStyle({ fontFamily: f }) }
  const pickBg = (c: string) => {
    setBg(c)
    onSettings(isDesc
      ? { descriptionBgColor: c || undefined, descriptionBgShape: c ? 'rect' : undefined }
      : { labelBgColor: c || undefined, labelBgShape: c ? 'rect' : undefined })
  }
  const persistTf = (r: number, sx: number, sy: number, sk: number) => {
    onSettings(isDesc
      ? { descriptionRotation: r, descriptionScaleX: sx, descriptionScaleY: sy, descriptionSkewX: sk }
      : { labelRotation: r, labelScaleX: sx, labelScaleY: sy, labelSkewX: sk })
  }
  const setRotation = (r: number) => { setRot(r); persistTf(r, scaleX, scaleY, skew) }
  const setSkewV = (v: number) => { setSkew(v); persistTf(rot, scaleX, scaleY, v) }
  const setScaleXV = (mag: number) => { const s = (scaleX < 0 ? -1 : 1) * mag; setScaleX(s); persistTf(rot, s, scaleY, skew) }
  const setScaleYV = (mag: number) => { const s = (scaleY < 0 ? -1 : 1) * mag; setScaleY(s); persistTf(rot, scaleX, s, skew) }
  const flipH = () => { const s = -scaleX; setScaleX(s); persistTf(rot, s, scaleY, skew) }
  const flipV = () => { const s = -scaleY; setScaleY(s); persistTf(rot, scaleX, s, skew) }
  const resetTf = () => { setRot(0); setSkew(0); setScaleX(1); setScaleY(1); persistTf(0, 1, 1, 0) }
  const setAlignment = (a: TextAlign) => { setAlign(a); onSettings({ descriptionAlign: a }) }
  const toggleVertical = () => { const v = vertOn ? 'off' : 'on'; setVertOn(!vertOn); onSettings({ vertical: v }) }
  const changeBgOpacity = (o: number) => { setBgOpacity(o); onSettings({ descriptionBgOpacity: o }) }

  // Match the editor background to the committed look: color WITH its opacity (rgba),
  // keeping the text fully opaque.
  const toRgba = (hex: string, a: number) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return hex
    const n = parseInt(m[1], 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
  }
  const inputStyle: React.CSSProperties = {
    position: 'absolute', left: req.left, top: req.top, width: req.width, height: req.height,
    fontSize: size, color, fontFamily: font, fontWeight: bold ? 700 : 400,
    textAlign: align, background: bg ? toRgba(bg, bgOpacity) : '#ffffff',
    border: '1px solid #3b82f6', borderRadius: 3, padding: '1px 3px', outline: 'none', resize: 'none', zIndex: 50,
  }
  // Keep the floating toolbar (and its popovers) fully on-screen. It can wrap to several
  // rows on mobile, so measure its real size: clamp `left` so it never runs off the right
  // edge, and place it its own height ABOVE the field (dropping below only if it wouldn't
  // fit above) — otherwise the taller wrapped bar would overlap and hide the input box.
  const tbRef = useRef<HTMLDivElement>(null)
  const [tb, setTb] = useState({ left: req.left, top: Math.max(0, req.top - 40), h: 34 })
  useLayoutEffect(() => {
    const el = tbRef.current
    const w = el?.offsetWidth ?? 0
    const h = el?.offsetHeight ?? 34
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    const left = Math.max(8, Math.min(req.left, vw - 8 - w))
    let top = req.top - h - 6
    if (top < 4) top = Math.min(req.top + req.height + 6, vh - h - 6)
    setTb({ left, top, h })
  }, [req.left, req.top, req.height, isNote, isDesc, size, font, bold, vertOn])
  const btn = (active: boolean, onClick: () => void, title: string, children: React.ReactNode) => (
    <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className={`flex h-7 min-w-7 items-center justify-center rounded px-1 text-sm ${
        active ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
      {children}
    </button>
  )

  return (
    <div ref={wrapRef} onBlur={onWrapBlur}>
      {/* Floating toolbar */}
      <div ref={tbRef} className="absolute z-[51] flex flex-wrap items-center gap-0.5 rounded-md border border-gray-200 bg-white px-1 py-0.5 shadow-lg"
        style={{ left: tb.left, top: tb.top, maxWidth: 'calc(100vw - 16px)' }}>
        {btn(false, () => setSizeBy(-1), 'フォント小', <span>A−</span>)}
        <span className="w-5 text-center text-xs text-gray-600">{size}</span>
        {btn(false, () => setSizeBy(1), 'フォント大', <span className="font-bold">A+</span>)}
        {btn(bold, toggleBold, '太字', <span className="font-bold">B</span>)}
        {btn(vertOn, toggleVertical, '縦書き（この項目のみ）', <span className="text-xs">縦</span>)}
        <button type="button" title="文字色" onMouseDown={(e) => e.preventDefault()}
          onClick={() => setPicker(picker === 'text' ? null : 'text')}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100">
          <span className="font-bold underline" style={{ color: color || '#333' }}>A</span>
        </button>
        <button type="button" title="背景色" onMouseDown={(e) => e.preventDefault()}
          onClick={() => setPicker(picker === 'bg' ? null : 'bg')}
          className="h-6 w-6 rounded border border-gray-300" style={{ background: bg || '#fff' }} />
        <div className="w-28"><FontSelector value={font} onChange={pickFont} /></div>
        {isNote && (
          <select
            title="メモの形（各風）"
            value={noteShape}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => { const v = e.target.value as typeof noteShape; setNoteShape(v); onSettings({ noteShape: v }) }}
            className="rounded border border-gray-300 px-1 py-0.5 text-xs"
          >
            <option value="plain">無地</option>
            <option value="sticky">付箋</option>
            <option value="bubble">吹き出し</option>
            <option value="oval">楕円</option>
            <option value="cloud">雲（思考）</option>
            <option value="burst">集中（強調）</option>
            <option value="card">カード</option>
            <option value="banner">バナー</option>
          </select>
        )}
        {isNote && onDelete && (
          <button type="button" title="メモを削除" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { committed.current = true; onDelete() }}
            className="flex h-6 w-6 items-center justify-center rounded border border-red-300 text-red-600 hover:bg-red-50">
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
        {isDesc && <>
          {btn(align === 'left', () => setAlignment('left'), '左揃え', <Bars3BottomLeftIcon className="h-4 w-4" />)}
          {btn(align === 'center', () => setAlignment('center'), '中央', <Bars3Icon className="h-4 w-4" />)}
          {btn(align === 'right', () => setAlignment('right'), '右揃え', <Bars3BottomRightIcon className="h-4 w-4" />)}
        </>}
        {btn(picker === 'deform', () => setPicker(picker === 'deform' ? null : 'deform'), '変形（回転・傾き・伸縮・反転）',
          <span className="text-xs">変形</span>)}
      </div>

      {/* Color popovers */}
      {picker === 'text' && (
        <div className="absolute z-[52]" style={{ left: tb.left, top: tb.top + tb.h + 4 }}>
          <ColorPickerPopover value={color} onChange={pickColor} onClose={() => setPicker(null)} />
        </div>
      )}
      {picker === 'bg' && (
        <div className="absolute z-[52]" style={{ left: tb.left, top: tb.top + tb.h + 4 }} onMouseDown={(e) => e.stopPropagation()}>
          <ColorPickerPopover value={bg} onChange={pickBg} onClose={() => setPicker(null)}>
            {isDesc && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-600">透明度</span>
                <input type="range" min={0} max={1} step={0.05} value={bgOpacity}
                  onChange={(e) => changeBgOpacity(Number(e.target.value))} className="flex-1 accent-blue-600" />
                <span className="w-8 text-right text-[10px] text-gray-600">{Math.round(bgOpacity * 100)}%</span>
              </div>
            )}
          </ColorPickerPopover>
        </div>
      )}
      {picker === 'deform' && (
        <div className="absolute z-[52] w-56 rounded-lg border border-gray-300 bg-white p-3 shadow-xl"
          style={{ left: tb.left, top: tb.top + tb.h + 4 }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">変形</span>
            <button type="button" onClick={() => setPicker(null)} className="flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100" title="閉じる">×</button>
          </div>
          <label className="text-xs text-gray-500">回転 {rot}°</label>
          <input type="range" min={-180} max={180} step={5} value={rot} onChange={(e) => setRotation(Number(e.target.value))} className="mb-2 w-full accent-blue-600" />
          <label className="text-xs text-gray-500">傾き {skew}°</label>
          <input type="range" min={-45} max={45} step={1} value={skew} onChange={(e) => setSkewV(Number(e.target.value))} className="mb-2 w-full accent-blue-600" />
          <label className="text-xs text-gray-500">横比 {Math.abs(scaleX).toFixed(1)}×</label>
          <input type="range" min={0.5} max={2} step={0.1} value={Math.abs(scaleX)} onChange={(e) => setScaleXV(Number(e.target.value))} className="mb-2 w-full accent-blue-600" />
          <label className="text-xs text-gray-500">縦比 {Math.abs(scaleY).toFixed(1)}×</label>
          <input type="range" min={0.5} max={2} step={0.1} value={Math.abs(scaleY)} onChange={(e) => setScaleYV(Number(e.target.value))} className="mb-2 w-full accent-blue-600" />
          <div className="flex gap-2">
            <button type="button" onClick={flipH} className={`flex-1 rounded border px-2 py-1 text-xs ${scaleX < 0 ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>左右反転</button>
            <button type="button" onClick={flipV} className={`flex-1 rounded border px-2 py-1 text-xs ${scaleY < 0 ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>上下反転</button>
          </div>
          <button type="button" onClick={resetTf} className="mt-2 w-full rounded border border-gray-300 py-1 text-xs text-gray-600 hover:bg-gray-50">変形をリセット</button>
        </div>
      )}

      {/* Editable field */}
      {isDesc
        ? <textarea ref={inputRef} value={val} style={inputStyle} onKeyDown={onKeyDown} onChange={(e) => setVal(e.target.value)} />
        : <input ref={inputRef} value={val} style={inputStyle} onKeyDown={onKeyDown} onChange={(e) => setVal(e.target.value)} />}
    </div>
  )
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
    addNote,
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
    drawings,
    addStroke,
    deleteStroke,
    clearDrawings,
    moveStrokes,
    deleteStrokes,
    undoDraw,
    redoDraw,
    canUndoDraw,
    canRedoDraw,
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
    viewSettings,
    setBackground,
    setBackgroundImage,
    setBackgroundOpacity,
    setVerticalText,
    dpi,
    setDpi,
    thumbnailDpi,
    t,
  } = useDataContext()

  const [nodeCardPos, setNodeCardPos] = useState({ x: 200, y: 100 })
  const [edgeCardPos, setEdgeCardPos] = useState({ x: 400, y: 200 })
  // Whiteboard / annotation drawing toolbar state
  const [wbOpen, setWbOpen] = useState(false)
  const [drawMode, setDrawMode] = useState<DrawTool | 'eraser' | 'select' | null>(null)
  const [drawColor, setDrawColor] = useState('#ef4444')
  const [drawWidth, setDrawWidth] = useState(3)
  const [inlineEdit, setInlineEdit] = useState<InlineEditRequest | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [exportMenu, setExportMenu] = useState(false)
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

  // Tracks which page's data is actually loaded into the context. Until this matches `id`,
  // `viewSettings`/`viewport` still hold the PREVIOUS chart's values (loadPage is async), so
  // the canvas must not restore from them — otherwise a chart reopens with the prior chart's
  // layout mode / spacing / edge style. See the gated props on <DynastyNetwork> below.
  const [loadedId, setLoadedId] = useState<string | null>(null)
  useEffect(() => {
    if (id) {
      loadPage(id).then((page) => {
        if (!page) onBack()
        else setLoadedId(id)
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
      // Ctrl/Cmd+Z → undo whiteboard drawing; Ctrl+Shift+Z / Ctrl+Y → redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !isEditable(e.target) && !isViewMode) {
        e.preventDefault()
        if (e.shiftKey) redoDraw(); else undoDraw()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y') && !isEditable(e.target) && !isViewMode) {
        e.preventDefault()
        redoDraw()
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
    setSelectedNode, setSelectedRelationship, undoDraw, redoDraw])

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

  const handleAddNote = useCallback(() => {
    if (isViewMode) return
    const vp = netRef.current?.getViewport()
    const el = containerRef.current
    if (vp && el) {
      const k = vp.k || 1
      addNote((el.clientWidth / 2 - vp.x) / k, (el.clientHeight / 2 - vp.y) / k)
    } else {
      addNote()
    }
  }, [isViewMode, addNote])

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

  const handleExportCsv = async () => {
    const { graphToCsv } = await import('@/utils/csv')
    const csv = graphToCsv(persons, relationships)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(currentPage?.title || 'chart').replace(/[^a-z0-9]/gi, '_')}.csv`
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
        const svgEl = containerRef.current?.querySelector('svg.fc-canvas-svg') as SVGSVGElement | null
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

    // Persist the current zoom/pan + layout settings so the page reloads identically.
    const vp = netRef.current?.getViewport()
    const vs = netRef.current?.getViewSettings()
    const result = await savePage({
      ...thumbnailPatch,
      ...(vp ? { viewport: vp } : {}),
      ...(vs ? { viewSettings: vs } : {}),
      ...(dpi !== undefined ? { dpi } : {}),
    })
    setSaveStatus(result
      ? { message: t('Saved successfully!', 'Saved successfully!'), type: 'success' }
      : { message: t('Save failed', 'Save failed'), type: 'error' })
    setSaving(false)
    setTimeout(() => setSaveStatus(null), 3000)
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

  // Merge a { persons, relationships } graph into the current chart (shared by JSON + CSV).
  const mergeGraph = useCallback((persons_: Record<string, unknown>[], rels_: Record<string, unknown>[]) => {
    // Offset the imported block to the RIGHT of existing nodes, preserving relative layout.
    const existingXs = persons.map((p) => p.x).filter((v): v is number => typeof v === 'number')
    const baseX = existingXs.length ? Math.max(...existingXs) + 220 : 120
    const impXs = persons_
      .map((p) => (typeof p.x === 'number' ? (p.x as number) : null))
      .filter((v): v is number => v != null)
    const impMinX = impXs.length ? Math.min(...impXs) : 0
    const dx = baseX - impMinX

    const idMap = new Map<string, string>()   // old id / name → new id
    persons_.forEach((p, i) => {
      if (!p.name && !p.id) return
      const x = (typeof p.x === 'number' ? p.x : 200 + (i % 8) * 170) + dx
      const y = (typeof p.y === 'number' ? p.y : 100 + Math.floor(i / 8) * 170)
      const node = addPerson({ ...p, x, y, fx: x, fy: y })
      if (p.id) idMap.set(p.id as string, node.id)
      if (p.name) idMap.set(p.name as string, node.id)
    })
    for (const r of rels_) {
      const s = idMap.get(r.source as string) || (r.source as string)
      const t = idMap.get(r.target as string) || (r.target as string)
      addRelationship({ ...r, source: s, target: t })
    }
  }, [persons, addPerson, addRelationship])

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const isCsv = /\.csv$/i.test(file.name) || (!text.trim().startsWith('{') && !text.trim().startsWith('['))
      if (isCsv) {
        const { parseCsvToGraph } = await import('@/utils/csv')
        const { persons: cp, relationships: cr } = parseCsvToGraph(text)
        if (!cp.length) { alert('CSV にデータが見つかりません（docs/csv-format.md 参照）。'); e.target.value = ''; return }
        mergeGraph(cp as Record<string, unknown>[], cr as Record<string, unknown>[])
        alert(`CSV インポート完了: ${cp.filter((p) => p.type !== 'union').length}人 を追加しました。`)
      } else {
        const parsed = JSON.parse(text)
        const src = parsed.chartProps ?? parsed
        const persons_ = Array.isArray(src.persons) ? src.persons : []
        const rels_ = Array.isArray(src.relationships) ? src.relationships : []
        if (persons_.length === 0 && rels_.length === 0) {
          alert('インポート対象が見つかりません（docs/import-schema.md 参照）。')
          e.target.value = ''; return
        }
        mergeGraph(persons_, rels_)
        alert(`インポート完了: ${persons_.length}人 / ${rels_.length}関係 を追加しました。`)
      }
    } catch (err) {
      console.error('import error:', err)
      alert('インポート失敗：ファイル形式を確認してください（JSON: docs/import-schema.md / CSV: docs/csv-format.md）。')
    }
    e.target.value = ''
  }, [mergeGraph])

  const handlePdfExport = useCallback(() => {
    const svgEl = containerRef.current?.querySelector('svg.fc-canvas-svg') as SVGSVGElement | null
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
          <div className="relative">
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
              <span className="fc-tb-label">Save</span>
            </button>
            {saveStatus && (
              <div
                className={`absolute top-full left-0 mt-1 w-max max-w-[220px] whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium shadow z-30 ${
                  saveStatus.type === 'success' ? 'bg-blue-500 text-white' : 'bg-red-100 text-red-800'
                }`}
              >
                {saveStatus.message}
              </div>
            )}
          </div>
          <button
            onClick={() => setPreviewing(true)}
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm"
            title="Preview (check the result, then return to editing)"
          >
            <EyeIcon className="h-4 w-4" />
            <span className="fc-tb-label">Preview</span>
          </button>
          <div className="relative">
            <button
              onClick={() => setExportMenu((o) => !o)}
              className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200"
              title="エクスポート（JSON / CSV）"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              <span className="fc-tb-label">Export</span>
            </button>
            {exportMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setExportMenu(false)} />
                <div className="absolute right-0 top-full z-40 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  <button className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => { setExportMenu(false); handleExport() }}>JSON（図全体）</button>
                  <button className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => { setExportMenu(false); handleExportCsv() }}>CSV（人物・関係）</button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => importInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200"
            title="インポート（JSON / CSV）"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            <span className="fc-tb-label">Import</span>
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
            <span className="fc-tb-label">設定</span>
          </button>
          <button
            onClick={handlePdfExport}
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200"
            title="Print / Export as PDF"
          >
            <PrinterIcon className="h-4 w-4" />
            <span className="fc-tb-label">PDF</span>
          </button>
          <button
            onClick={handleReload}
            disabled={reloading}
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200 disabled:opacity-60"
            title="再読み込み（保存済みの内容に戻す）"
          >
            <ArrowPathIcon className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
            <span className="fc-tb-label">Reload</span>
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
            accept=".json,application/json,.csv,text/csv"
            className="hidden"
            onChange={handleImport}
          />
        </header>
      )}

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <DynastyNetwork
          key={id}
          ref={netRef}
          initialTransform={loadedId === id ? (viewport ?? null) : null}
          initialViewSettings={loadedId === id ? (viewSettings ?? null) : null}
          background={background}
          backgroundImage={backgroundImage}
          backgroundOpacity={backgroundOpacity}
          verticalText={verticalText}
          editable={!isViewMode}
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
          onInlineEdit={(req) => {
            // Close the floating cards so the in-place editor is the only focused UI.
            setSelectedNode(null)
            setSelectedRelationship(null)
            setInlineEdit(req)
          }}
          connectMode={connectState.active}
          drawings={drawings}
          drawMode={isViewMode ? null : drawMode}
          drawColor={drawColor}
          drawWidth={drawWidth}
          onStrokeCommit={addStroke}
          onStrokeErase={deleteStroke}
          onStrokesMove={moveStrokes}
          onStrokesDelete={deleteStrokes}
        />

        {/* In-place (double-click) editor overlay — React-owned so it survives canvas re-renders */}
        {inlineEdit && (
          <>
            {/* Transparent backdrop: catches the "click outside" so it blurs the field
                (→ commit) WITHOUT reaching the canvas (which would pan/zoom the view). */}
            <div className="absolute inset-0 z-40" />
            <InlineEditOverlay
              req={inlineEdit}
              node={persons.find((p) => p.id === inlineEdit.nodeId)}
              onCommit={(v) => {
                if (v !== inlineEdit.value) updatePerson(inlineEdit.nodeId, { [inlineEdit.field]: v })
                setInlineEdit(null)
              }}
              onSettings={(patch) => updatePerson(inlineEdit.nodeId, patch)}
              onCancel={() => setInlineEdit(null)}
              onDelete={() => { deletePerson(inlineEdit.nodeId); setInlineEdit(null) }}
            />
          </>
        )}

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

        {/* Add note FAB (free-standing annotation) */}
        {!isViewMode && (
          <button
            onClick={handleAddNote}
            className="absolute bottom-20 left-6 z-20 h-12 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-lg flex items-center gap-1 text-sm transition-colors"
            title="メモ（注釈）を追加"
          >
            <DocumentPlusIcon className="h-5 w-5" />
            <span className="fc-tb-label">メモ</span>
          </button>
        )}

        {/* Whiteboard / annotation toolbar */}
        {!isViewMode && (
          <>
            {/* Toggle FAB */}
            <button
              onClick={() => { setWbOpen((o) => { const n = !o; if (!n) setDrawMode(null); return n }) }}
              className={`absolute bottom-36 left-6 z-20 h-12 px-3 rounded-full shadow-lg flex items-center gap-1 text-sm transition-colors ${
                wbOpen || drawMode ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300'
              }`}
              title="ホワイトボード（手描き・注釈）"
            >
              <PencilIcon className="h-5 w-5" />
              <span className="fc-tb-label">お絵かき</span>
            </button>

            {/* Tool panel */}
            {wbOpen && (
              <div
                className="absolute bottom-52 left-6 z-30 flex max-w-[calc(100vw-3rem)] flex-col gap-2 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-xl backdrop-blur"
                style={{ touchAction: 'manipulation' }}
              >
                {/* Tools */}
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ['select', '⬚', '選択・移動'],
                    ['pen', '✏️', 'ペン'],
                    ['highlighter', '🖍️', 'マーカー'],
                    ['line', '／', '直線'],
                    ['arrow', '↗', '矢印'],
                    ['rect', '▭', '矩形'],
                    ['ellipse', '◯', '楕円'],
                    ['eraser', '🧽', '消しゴム'],
                  ] as [DrawTool | 'eraser' | 'select', string, string][]).map(([tool, icon, label]) => (
                    <button
                      key={tool}
                      onClick={() => setDrawMode((m) => (m === tool ? null : tool))}
                      title={label}
                      className={`flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-lg px-2 text-base transition-colors ${
                        drawMode === tool ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <span>{icon}</span>
                    </button>
                  ))}
                </div>

                {/* Colors */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {['#ef4444', '#111827', '#2563eb', '#16a34a', '#f59e0b', '#eab308', '#ffffff'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setDrawColor(c)}
                      title={c}
                      className={`h-8 w-8 rounded-full border-2 transition ${drawColor === c ? 'border-emerald-600 ring-2 ring-emerald-300' : 'border-gray-300'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                {/* Width */}
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={1} max={16} value={drawWidth}
                    onChange={(e) => setDrawWidth(Number(e.target.value))}
                    className="h-2 flex-1 accent-emerald-600"
                    style={{ minWidth: 90 }}
                  />
                  <span className="w-6 text-center text-xs text-gray-500">{drawWidth}</span>
                </div>

                {/* Undo / redo / clear */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={undoDraw} disabled={!canUndoDraw}
                    className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-gray-100 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                    title="元に戻す (Ctrl+Z)"
                  >
                    <ArrowUturnLeftIcon className="h-4 w-4" /><span className="fc-tb-label">戻す</span>
                  </button>
                  <button
                    onClick={redoDraw} disabled={!canRedoDraw}
                    className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-gray-100 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                    title="やり直し (Ctrl+Shift+Z)"
                  >
                    <ArrowUturnRightIcon className="h-4 w-4" /><span className="fc-tb-label">やり直し</span>
                  </button>
                  <button
                    onClick={() => { if (window.confirm('手描き注釈をすべて消去しますか？')) clearDrawings() }}
                    className="flex h-9 items-center justify-center rounded-lg bg-red-50 px-2 text-red-600 hover:bg-red-100"
                    title="すべて消去"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
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
