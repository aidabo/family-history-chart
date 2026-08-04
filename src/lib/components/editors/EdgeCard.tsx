'use client'

import { useState, useRef, useEffect } from 'react'
import { Relationship, PersonNode } from '@/types/charts'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { relationLabelMulti } from '@/utils/relationLabels'
import { useDataContext } from '@/context/DataContext'

interface Props {
  relationship: Relationship
  persons: PersonNode[]
  position: { x: number; y: number }
  onUpdate: (id: string, updates: Partial<Relationship>) => void
  onDelete: (id: string) => void
  onConvertToUnion: (rel: Relationship) => void
  onClose: () => void
}

type RelType = Relationship['type']

// Labels shown trilingual (ja / zh / en) via relationLabelMulti.
const TYPE_OPTIONS: RelType[] = [
  'parent-child', 'marriage', 'remarriage', 'sibling', 'succession', 'friend',
  'ally', 'liege', 'master', 'disciple', 'comrade', 'rival', 'enemy', 'custom',
]

export function EdgeCard({ relationship, persons, position, onUpdate, onDelete, onConvertToUnion, onClose }: Props) {
  const { t } = useDataContext()
  const iw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const ih = typeof window !== 'undefined' ? window.innerHeight : 800

  const [pos, setPos] = useState({
    x: Math.max(10, Math.min(position.x, iw - 260)),
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

  const getName = (id: string) => persons.find((p) => p.id === id)?.name ?? id
  const isMarriage = relationship.type === 'marriage' || relationship.type === 'remarriage'

  return (
    <div
      style={{ left: pos.x, top: pos.y, width: 260 }}
      className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200"
    >
      {/* Drag handle header — same as NodeCard */}
      <div
        onMouseDown={startDrag}
        className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-200 rounded-t-xl cursor-grab active:cursor-grabbing select-none"
      >
        <span className="text-gray-400 text-lg leading-none" aria-hidden>⠿</span>
        <span className="flex-1 text-sm font-semibold text-gray-800 truncate">
          {getName(relationship.source)} — {getName(relationship.target)}
        </span>
        <button
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors"
          title={t('Close', 'Close')}
        >
          ×
        </button>
      </div>

      <div className="px-3 py-3 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 48px)' }}>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">{t('Type', 'Type')}</label>
          <select
            value={relationship.type}
            onChange={(e) => onUpdate(relationship.id, { type: e.target.value as RelType })}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>{relationLabelMulti(o)}</option>
            ))}
          </select>
        </div>

        {/* Union node checkbox — insert an intermediate node (children branch from it).
            Pre-checked for marriage/remarriage; checking it converts this edge. */}
        {relationship.type !== 'partner' && (
          <label className="flex items-center gap-2 text-xs cursor-pointer bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            <input
              type="checkbox"
              defaultChecked={isMarriage}
              onChange={(e) => { if (e.target.checked) onConvertToUnion(relationship) }}
              className="accent-blue-500 h-3.5 w-3.5"
            />
            <span className="text-gray-700">{t('Create intermediate node', '中間ノード(union)を作成 — 子を分岐できる')}</span>
          </label>
        )}

        <div>
          <label className="block text-xs text-gray-500 mb-0.5">{t('Label', 'Label')}</label>
          <input
            type="text"
            defaultValue={relationship.label ?? ''}
            onBlur={(e) => onUpdate(relationship.id, { label: e.target.value })}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        <ColorPicker
          value={relationship.color}
          onChange={(color) => onUpdate(relationship.id, { color })}
          label={t('Color', 'Color')}
        />

        <div>
          <label className="block text-xs text-gray-500 mb-1">
            {t('Line Width', 'Line Width')}: {relationship.width ?? 1}
          </label>
          <input
            type="range" min={1} max={6} step={1}
            value={relationship.width ?? 1}
            onChange={(e) => onUpdate(relationship.id, { width: Number(e.target.value) })}
            className="w-full accent-blue-500"
          />
        </div>

        {isMarriage && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">{t('Start', '開始 Start')}</label>
              <input
                type="text"
                defaultValue={relationship.start ?? ''}
                onBlur={(e) => onUpdate(relationship.id, { start: e.target.value })}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">{t('End', '終了 End')}</label>
              <input
                type="text"
                defaultValue={relationship.end ?? ''}
                onBlur={(e) => onUpdate(relationship.id, { end: e.target.value })}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
        )}

        <button
          onClick={() => onDelete(relationship.id)}
          className="w-full text-xs py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
        >
          {t('Delete Relationship', 'Delete Relationship')}
        </button>
      </div>
    </div>
  )
}
