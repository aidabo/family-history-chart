'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { Episode, PersonNode, Relationship } from '@/types/charts'
import { IdentitySection } from '@/components/editors/IdentitySection'
import { AppearanceSection } from '@/components/editors/AppearanceSection'
import { DescriptionSection } from '@/components/editors/DescriptionSection'
import { RelationshipsSection } from '@/components/editors/RelationshipsSection'
import { EpisodesSection } from '@/components/editors/EpisodesSection'

interface NodeCardProps {
  node: PersonNode
  position: { x: number; y: number }
  relationships: Relationship[]
  persons: PersonNode[]
  episodes: Episode[]
  onUpdate: (id: string, updates: Partial<PersonNode>) => void
  onClose: () => void
  onDelete: (id: string) => void
  onUploadFile?: (file: File) => Promise<string>
  onStartConnect: () => void
  onRemoveRelationship: (relId: string) => void
  onAddEpisode: (ep: Omit<Episode, 'id'>) => void
  onUpdateEpisode: (id: string, updates: Partial<Episode>) => void
  onDeleteEpisode: (id: string) => void
}

function AccordionSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-4 py-2.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span>{title}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-0.5">{children}</div>}
    </div>
  )
}

export function NodeCard({
  node, position, relationships, persons, episodes,
  onUpdate, onClose, onDelete, onUploadFile, onStartConnect, onRemoveRelationship,
  onAddEpisode, onUpdateEpisode, onDeleteEpisode,
}: NodeCardProps) {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))
  const iw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const ih = typeof window !== 'undefined' ? window.innerHeight : 800

  const [pos, setPos] = useState({
    x: clamp(position.x, 10, iw - 310),
    y: clamp(position.y, 10, ih - 100),
  })

  const dragging = useRef(false)
  const origin = useRef({ mx: 0, my: 0, cx: 0, cy: 0 })

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
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startDrag = (e: React.MouseEvent) => {
    dragging.current = true
    origin.current = { mx: e.clientX, my: e.clientY, cx: pos.x, cy: pos.y }
    e.preventDefault()
  }

  const handleChange = (updates: Partial<PersonNode>) => onUpdate(node.id, updates)

  return (
    <div
      style={{ left: pos.x, top: pos.y, width: 300 }}
      className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden"
    >
      {/* Drag handle header */}
      <div
        onMouseDown={startDrag}
        className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-200 cursor-grab active:cursor-grabbing select-none"
      >
        <span className="text-gray-400 text-lg leading-none" aria-hidden>⠿</span>
        <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{node.name}</span>
        <button
          onClick={() => onDelete(node.id)}
          onMouseDown={(e) => e.stopPropagation()}
          className="text-gray-400 hover:text-red-500 text-base leading-none transition-colors px-1"
          title="この人物を削除 (Delete / Backspace)"
        >
          🗑
        </button>
        <button
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors"
          title="Close (Esc)"
        >
          ×
        </button>
      </div>

      {/* Scrollable accordion body — key forces remount on node switch so uncontrolled inputs get fresh defaultValues (fixes CJK IME stale input) */}
      <div key={node.id} className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 48px)' }}>
        <AccordionSection title="Identity">
          <IdentitySection node={node} onChange={handleChange} onUpload={onUploadFile} />
        </AccordionSection>
        <AccordionSection title="Appearance">
          <AppearanceSection node={node} onChange={handleChange} />
        </AccordionSection>
        <AccordionSection title="Description">
          <DescriptionSection node={node} onChange={handleChange} />
        </AccordionSection>
        <AccordionSection title="Episodes">
          <EpisodesSection
            personId={node.id}
            episodes={episodes}
            onAdd={onAddEpisode}
            onUpdate={onUpdateEpisode}
            onDelete={onDeleteEpisode}
          />
        </AccordionSection>
        <AccordionSection title="Relationships">
          <RelationshipsSection
            node={node}
            relationships={relationships}
            persons={persons}
            onRemove={onRemoveRelationship}
            onStartConnect={onStartConnect}
          />
        </AccordionSection>
      </div>
    </div>
  )
}
