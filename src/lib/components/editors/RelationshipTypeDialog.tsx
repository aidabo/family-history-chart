'use client'

import { useState, useRef, useEffect } from 'react'
import { PersonNode, Relationship } from '@/types/charts'

interface Props {
  sourceId: string
  targetId: string
  persons: PersonNode[]
  initialX?: number
  initialY?: number
  onConfirm: (rel: Partial<Relationship>, useUnionNode: boolean) => void
  onCancel: () => void
}

type RelType = Relationship['type']

interface Option {
  id: string
  label: string
  type: RelType
  swap: boolean
  canUnion?: boolean
}

const OPTIONS: Option[] = [
  { id: 'parent-to-child',   label: 'Parent → Child 親子',  type: 'parent-child', swap: false },
  { id: 'child-from-parent', label: 'Child ← Parent 子親',  type: 'parent-child', swap: true  },
  { id: 'marriage',          label: '結婚 Marriage',          type: 'marriage',     swap: false, canUnion: true },
  { id: 'remarriage',        label: '再婚 Remarriage',        type: 'remarriage',   swap: false, canUnion: true },
  { id: 'sibling',           label: '兄弟 Sibling',           type: 'sibling',      swap: false, canUnion: true },
  { id: 'succession',        label: '継承 Succession →',      type: 'succession',   swap: false, canUnion: true },
  { id: 'friend',            label: '親友 Friend',            type: 'friend',       swap: false, canUnion: true },
  { id: 'ally',              label: '同盟 Ally',              type: 'ally',         swap: false, canUnion: true },
  { id: 'master',            label: '師匠 Master →',          type: 'master',       swap: false, canUnion: true },
  { id: 'disciple',          label: '弟子 Disciple →',        type: 'disciple',     swap: false, canUnion: true },
  { id: 'comrade',           label: '戦友 Comrade',           type: 'comrade',      swap: false, canUnion: true },
  { id: 'rival',             label: '対立 Rival',             type: 'rival',        swap: false, canUnion: true },
  { id: 'enemy',             label: '敵対 Enemy',             type: 'enemy',        swap: false, canUnion: true },
  { id: 'custom',            label: 'Custom カスタム',        type: 'custom',       swap: false },
]

export function RelationshipTypeDialog({ sourceId, targetId, persons, initialX, initialY, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<Option>(OPTIONS[0])
  const [label, setLabel] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [useUnionNode, setUseUnionNode] = useState(false)

  const [pos, setPos] = useState(() => {
    const iw = typeof window !== 'undefined' ? window.innerWidth  : 800
    const ih = typeof window !== 'undefined' ? window.innerHeight : 600
    const x = initialX != null ? Math.min(initialX + 12, iw - 320) : Math.max(20, iw / 2 - 160)
    const y = initialY != null ? Math.min(Math.max(initialY - 40, 20), ih - 120) : Math.max(20, ih / 2 - 220)
    return { x, y }
  })

  const dragging = useRef(false)
  const origin   = useRef({ mx: 0, my: 0, cx: 0, cy: 0 })

  // Same pattern as NodeCard: stable listeners via useEffect
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - 320, origin.current.cx + e.clientX - origin.current.mx)),
        y: Math.max(0, Math.min(window.innerHeight -  60, origin.current.cy + e.clientY - origin.current.my)),
      })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  const startDrag = (e: React.MouseEvent) => {
    dragging.current = true
    origin.current = { mx: e.clientX, my: e.clientY, cx: pos.x, cy: pos.y }
    e.preventDefault()
  }

  const getName = (id: string) => persons.find((p) => p.id === id)?.name ?? id

  const handleConfirm = () => {
    const src = selected.swap ? targetId : sourceId
    const tgt = selected.swap ? sourceId : targetId
    const rel: Partial<Relationship> = { type: selected.type, source: src, target: tgt }
    if (label) rel.label = label
    if (selected.type === 'marriage' || selected.type === 'remarriage') {
      if (start) rel.start = start
      if (end)   rel.end   = end
    }
    onConfirm(rel, useUnionNode && !!selected.canUnion)
  }

  const isMarriage = selected.type === 'marriage' || selected.type === 'remarriage'

  return (
    <div
      className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200"
      style={{ left: pos.x, top: pos.y, width: 300 }}
    >
        {/* Drag handle header — same structure as NodeCard */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 rounded-t-xl select-none cursor-grab active:cursor-grabbing"
          onMouseDown={startDrag}
        >
          <div>
            <h3 className="text-sm font-semibold text-gray-800">関係を追加 / Add Relationship</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-medium text-gray-700">{getName(sourceId)}</span>
              {' → '}
              <span className="font-medium text-gray-700">{getName(targetId)}</span>
            </p>
          </div>
          <span className="text-gray-400 text-base">⠿</span>
        </div>

        {/* Relation type list */}
        <div className="px-4 py-2 max-h-52 overflow-y-auto">
          {OPTIONS.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2.5 cursor-pointer text-sm py-0.5">
              <input
                type="radio"
                name="rel-type"
                checked={selected.id === opt.id}
                onChange={() => {
                  setSelected(opt)
                  // Marriage/remarriage default to a union node (children branch from it); others off
                  if (!opt.canUnion) setUseUnionNode(false)
                  else setUseUnionNode(opt.type === 'marriage' || opt.type === 'remarriage')
                }}
                className="accent-blue-500"
              />
              <span className={selected.id === opt.id ? 'text-blue-700 font-medium' : 'text-gray-700'}>
                {opt.label}
              </span>
            </label>
          ))}
        </div>

        <div className="px-4 pb-3 space-y-2 border-t border-gray-100 pt-2">
          {/* Union node checkbox */}
          {selected.canUnion && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={useUnionNode}
                onChange={(e) => setUseUnionNode(e.target.checked)}
                className="accent-blue-500 h-3.5 w-3.5"
              />
              <span className="text-gray-600">中間ノード作成（線の折り曲げに便利）</span>
            </label>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Label (任意)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. adopted / 養子"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {isMarriage && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">開始 Start</label>
                <input
                  type="text"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  placeholder="e.g. 1950"
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">終了 End</label>
                <input
                  type="text"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  placeholder="e.g. 1980"
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={onCancel}
            className="flex-1 text-sm py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 text-sm py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors font-medium"
          >
            Confirm
          </button>
        </div>
      </div>
  )
}
