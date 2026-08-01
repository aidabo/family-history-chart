'use client'

import { useState, useRef, useEffect } from 'react'
import { PersonNode, RelationType } from '@/types/charts'

const TYPE_OPTIONS: { value: RelationType; label: string }[] = [
  { value: 'marriage',     label: '結婚 Marriage' },
  { value: 'remarriage',   label: '再婚 Remarriage' },
  { value: 'sibling',      label: '兄弟姉妹 Sibling' },
  { value: 'parent-child', label: '親子 Parent–Child' },
  { value: 'succession',   label: '継承 Succession' },
  { value: 'friend',       label: '親友 Friend' },
  { value: 'ally',         label: '同盟 Ally' },
  { value: 'master',       label: '師匠 Master' },
  { value: 'disciple',     label: '弟子 Disciple' },
  { value: 'comrade',      label: '戦友 Comrade' },
  { value: 'rival',        label: '対立 Rival' },
  { value: 'enemy',        label: '敵対 Enemy' },
  { value: 'custom',       label: 'Custom カスタム' },
]

interface Props {
  union: PersonNode
  partners: PersonNode[]
  children: PersonNode[]
  position: { x: number; y: number }
  onUpdate: (id: string, updates: Partial<PersonNode>) => void
  onDissolve: (unionId: string) => void
  onDelete: (unionId: string) => void
  onClose: () => void
}

export function UnionCard({ union, partners, children, position, onUpdate, onDissolve, onDelete, onClose }: Props) {
  const iw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const ih = typeof window !== 'undefined' ? window.innerHeight : 800

  const [pos, setPos] = useState({
    x: Math.max(10, Math.min(position.x, iw - 280)),
    y: Math.max(10, Math.min(position.y, ih - 100)),
  })

  const dragging = useRef(false)
  const origin   = useRef({ mx: 0, my: 0, cx: 0, cy: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({
        x: Math.max(0, origin.current.cx + e.clientX - origin.current.mx),
        y: Math.max(0, origin.current.cy + e.clientY - origin.current.my),
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

  const type: RelationType = union.marriage?.type ?? 'marriage'
  const isMarriage = type === 'marriage' || type === 'remarriage'
  const partnerNames = partners.map((p) => p.name || '(無名)').join('  —  ') || '(未接続)'

  const patch = (m: Partial<NonNullable<PersonNode['marriage']>>) =>
    onUpdate(union.id, { marriage: { ...union.marriage, ...m } })

  return (
    <div
      style={{ left: pos.x, top: pos.y, width: 268 }}
      className="fixed z-50 bg-white rounded-xl shadow-xl border border-orange-200"
    >
      {/* Drag handle header */}
      <div
        onMouseDown={startDrag}
        className="flex items-center gap-2 px-3 py-2.5 bg-orange-50 border-b border-orange-100 rounded-t-xl cursor-grab active:cursor-grabbing select-none"
      >
        <span className="text-orange-400 text-lg leading-none" aria-hidden>⠿</span>
        <span className="flex-1 text-sm font-semibold text-gray-800 truncate" title={partnerNames}>
          {partnerNames}
        </span>
        <button
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors"
          title="Close"
        >
          ×
        </button>
      </div>

      <div className="px-3 py-3 space-y-3">
        <p className="text-[11px] text-gray-400 -mt-1">
          中間(union)ノードは表示・レイアウト用の補助です。下記は元の実関係（上の2者間）。
        </p>

        <div>
          <label className="block text-xs text-gray-500 mb-0.5">関係 Type</label>
          <select
            value={type}
            onChange={(e) => patch({ type: e.target.value as RelationType })}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Label (任意)</label>
          <input
            type="text"
            defaultValue={union.marriage?.label ?? ''}
            onBlur={(e) => patch({ label: e.target.value })}
            placeholder="例: 初婚 / 継室"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
        </div>

        {isMarriage && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">開始 Start</label>
              <input
                type="text"
                defaultValue={union.marriage?.start ?? ''}
                onBlur={(e) => patch({ start: e.target.value })}
                placeholder="1950"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">終了 End</label>
              <input
                type="text"
                defaultValue={union.marriage?.end ?? ''}
                onBlur={(e) => patch({ end: e.target.value })}
                placeholder="1980"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>
          </div>
        )}

        {children.length > 0 && (
          <div className="text-xs text-gray-500">
            子 ({children.length}): <span className="text-gray-700">{children.map((c) => c.name || '(無名)').join(', ')}</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onDissolve(union.id)}
            className="flex-1 text-xs py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            title="union を解除して直接線に戻す（子は両親へ再接続）"
          >
            union解除
          </button>
          <button
            onClick={() => onDelete(union.id)}
            className="flex-1 text-xs py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            title="union と付随する線をすべて削除"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  )
}
