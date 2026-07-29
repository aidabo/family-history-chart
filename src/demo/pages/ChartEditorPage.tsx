import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useDataContext } from '@/context/DataContext'
import DynastyNetwork from '@/components/canvas/DynastyNetwork'
import { NodeCard } from '@/components/canvas/NodeCard'
import { EdgeCard } from '@/components/editors/EdgeCard'
import { UnionCard } from '@/components/editors/UnionCard'
import { RelationshipTypeDialog } from '@/components/editors/RelationshipTypeDialog'
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
} from '@heroicons/react/24/outline'

export default function ChartEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isViewMode = searchParams.get('mode') === 'view'

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
  } = useDataContext()

  const [nodeCardPos, setNodeCardPos] = useState({ x: 200, y: 100 })
  const [edgeCardPos, setEdgeCardPos] = useState({ x: 400, y: 200 })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

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

  useEffect(() => {
    if (id) {
      loadPage(id).then((page) => {
        if (!page) navigate('/charts')
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
    setSaving(true)
    const result = await savePage()
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
      // Drop the pan/zoom transform and the grid so the print shows only the framed content.
      if (cloneContainer) cloneContainer.removeAttribute('transform')
      clone.querySelector('.zoom-container > .grid')?.remove()
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
  }, [currentPage])

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
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* Top toolbar */}
      {!isViewMode && (
        <header className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 shadow-sm z-20 flex-shrink-0">
          <button
            onClick={() => navigate('/charts')}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
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
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {saving ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <CloudArrowDownIcon className="h-4 w-4" />
            )}
            {saveMsg ?? 'Save'}
          </button>
          <button
            onClick={() => navigate(`/edit/${id}?mode=view`)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm"
            title="Preview"
          >
            <EyeIcon className="h-4 w-4" />
            Preview
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200"
            title="Export as JSON"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200"
            title="Import JSON (see docs/import-schema.md)"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            Import
          </button>
          <button
            onClick={handlePdfExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200"
            title="Print / Export as PDF"
          >
            <PrinterIcon className="h-4 w-4" />
            PDF
          </button>
          <button
            onClick={handleReload}
            disabled={reloading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200 disabled:opacity-60"
            title="再読み込み（保存済みの内容に戻す）"
          >
            <ArrowPathIcon className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
            Reload
          </button>
          <button
            onClick={handleClear}
            className="p-2 rounded-lg text-red-500 hover:bg-red-50"
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
            onClick={() => handleAddPerson(300, 300)}
            className="absolute bottom-6 left-6 z-20 w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
            title="Add person (or double-click canvas)"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
        )}

        {/* View mode return button */}
        {isViewMode && (
          <button
            onClick={() => navigate(`/edit/${id}`)}
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
    </div>
  )
}
