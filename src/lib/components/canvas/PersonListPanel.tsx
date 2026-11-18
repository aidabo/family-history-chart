'use client'

import { useMemo, useRef, useState } from 'react'
import { UsersIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { PersonNode } from '@/types/charts'
import { useDataContext } from '@/context/DataContext'

// Left-hand list of the people in the chart. Grouped by the generation row of the current
// layout (so it reads like the 系図), filtered by the same query as the node search, and a
// click centres + selects that person on the canvas. Rows are windowed so a 400-person
// chart stays light.
export interface PersonListPanelProps {
  persons: PersonNode[]                 // real people only (no unions / notes / entities)
  query: string                         // shared with the node search box
  rowOf: (id: string) => number | null  // generation row from the current layout
  onPick: (p: PersonNode) => void
  onClose: () => void
  labelFor?: (index: number, ps: PersonNode[]) => string   // group heading (世代/年)
}

const ITEM_H = 30
const GROUP_H = 26

type Row =
  | { kind: 'group'; key: string; label: string }
  | { kind: 'person'; p: PersonNode }

export function PersonListPanel({ persons, query, rowOf, onPick, onClose, labelFor }: PersonListPanelProps) {
  const { t } = useDataContext()
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(360)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const { rows, tops, total } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = persons.filter(p =>
      !q || (p.name || '').toLowerCase().includes(q) || (p.title || '').toLowerCase().includes(q))
    const groups = new Map<number, PersonNode[]>()
    const loose: PersonNode[] = []
    for (const p of list) {
      const r = rowOf(p.id)
      if (r == null) loose.push(p)
      else (groups.get(r) || groups.set(r, []).get(r)!).push(p)
    }
    const out: Row[] = []
    const keys = [...groups.keys()].sort((a, b) => a - b)
    keys.forEach((k, i) => {
      const ps = groups.get(k)!.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      const head = labelFor ? labelFor(i, ps) : t('Generation GEN', '第GEN世代').replace('GEN', String(i + 1))
      out.push({ kind: 'group', key: `g${k}`, label: `${head} (${ps.length})` })
      for (const p of ps) out.push({ kind: 'person', p })
    })
    if (loose.length) {
      out.push({ kind: 'group', key: 'gx', label: t('Others', 'その他') + ` (${loose.length})` })
      loose.sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(p => out.push({ kind: 'person', p }))
    }
    const offsets: number[] = []
    let y = 0
    for (const r of out) { offsets.push(y); y += r.kind === 'group' ? GROUP_H : ITEM_H }
    return { rows: out, tops: offsets, total: y }
  }, [persons, query, rowOf, t, labelFor])

  // Render only the slice around the scroll position (plus an overscan).
  const visible = useMemo(() => {
    const out: Array<{ row: Row; top: number }> = []
    for (let i = 0; i < rows.length; i++) {
      const top = tops[i], h = rows[i].kind === 'group' ? GROUP_H : ITEM_H
      if (top + h < scrollTop - 90) continue
      if (top > scrollTop + viewport + 90) break
      out.push({ row: rows[i], top })
    }
    return out
  }, [rows, tops, scrollTop, viewport])

  const years = (p: PersonNode) => {
    const b = p.birth || '', d = p.death || ''
    return b || d ? `${b || '?'}–${d || '?'}` : ''
  }

  return (
    <div className="absolute top-60 left-2 z-10 hidden w-56 flex-col rounded-lg border border-gray-200 bg-white/95 shadow md:flex"
      style={{ maxHeight: '60%' }}>
      <div className="flex items-center justify-between border-b border-gray-100 px-2 py-1.5">
        <span className="flex items-center gap-1 text-sm font-semibold text-gray-700">
          <UsersIcon className="h-4 w-4 text-gray-500" aria-hidden="true" />
          {t('People', '人物')} ({persons.length})
        </span>
        <button onClick={onClose} aria-label={t('Close list', 'リストを閉じる')}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={el => { scrollRef.current = el; if (el) setViewport(el.clientHeight || 360) }}
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
        className="overflow-y-auto overscroll-contain"
        style={{ maxHeight: 'calc(60vh - 34px)' }}>
        <div className="relative" style={{ height: total }}>
          {visible.map(({ row, top }) => row.kind === 'group' ? (
            <div key={row.key} style={{ position: 'absolute', top, height: GROUP_H }}
              className="w-full px-2 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {row.label}
            </div>
          ) : (
            <button key={row.p.id} style={{ position: 'absolute', top, height: ITEM_H }}
              onClick={() => onPick(row.p)}
              title={row.p.name}
              className="flex w-full items-center gap-1 rounded px-2 text-left hover:bg-gray-100">
              <span className="truncate text-sm text-gray-800">{row.p.name || row.p.id}</span>
              {years(row.p) && <span className="ml-auto shrink-0 text-[11px] text-gray-400">{years(row.p)}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
