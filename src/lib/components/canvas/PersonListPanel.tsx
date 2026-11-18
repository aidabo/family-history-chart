'use client'

import { useMemo, useRef, useState } from 'react'
import { UsersIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { PersonNode } from '@/types/charts'
import { parseYear } from '@/utils/familyLayout'
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
  grouped?: boolean                                        // false = flat list
  sortByTime?: boolean                                     // flat list ordered by year (年表)
}

const ITEM_H = 30
const GROUP_H = 26

export type PersonListRow =
  | { kind: 'group'; key: string; label: string }
  | { kind: 'person'; p: PersonNode }


// 人物の「時間」: 開始（生年）が無ければ終了（没年）を使う。どちらも無ければ null。
// 年表の並びはこの値で決める（年の無い人は最後に名前順）。
export function personTimeOf(p: PersonNode): number | null {
  return parseYear(p.birth) ?? parseYear(p.death)
}

// Pure row builder (exported so it can be unit-tested): filter by query, group by the
// layout row when `grouped`, otherwise a flat list — by name, or by year when
// `sortByTime` (年表): birth year, else death year, undated last.
export function buildPersonListRows(
  persons: PersonNode[],
  query: string,
  rowOf: (id: string) => number | null,
  labelFor: ((index: number, ps: PersonNode[]) => string) | undefined,
  grouped: boolean,
  t: (en: string, ja: string) => string,
  sortByTime = false,
): { rows: PersonListRow[]; tops: number[]; total: number } {
  const q = query.trim().toLowerCase()
  const list = persons.filter(p =>
    !q || (p.name || '').toLowerCase().includes(q) || (p.title || '').toLowerCase().includes(q))
  const out: PersonListRow[] = []
  if (!grouped) {
    const byName = (a: PersonNode, b: PersonNode) => (a.name || '').localeCompare(b.name || '')
    const ordered = list.slice()
    if (sortByTime) {
      ordered.sort((a, b) => {
        const ta = personTimeOf(a), tb = personTimeOf(b)
        if (ta == null && tb == null) return byName(a, b)
        if (ta == null) return 1          // 年が無い人は最後
        if (tb == null) return -1
        return ta - tb || byName(a, b)
      })
    } else {
      ordered.sort(byName)
    }
    ordered.forEach(p => out.push({ kind: 'person', p }))
  } else {
    const groups = new Map<number, PersonNode[]>()
    const loose: PersonNode[] = []
    for (const p of list) {
      const r = rowOf(p.id)
      if (r == null) loose.push(p)
      else (groups.get(r) || groups.set(r, []).get(r)!).push(p)
    }
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
  }
  const tops: number[] = []
  let y = 0
  for (const r of out) { tops.push(y); y += r.kind === 'group' ? GROUP_H : ITEM_H }
  return { rows: out, tops, total: y }
}

export function PersonListPanel({ persons, query, rowOf, onPick, onClose, labelFor, grouped = true, sortByTime = false }: PersonListPanelProps) {
  const { t } = useDataContext()
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(360)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const { rows, tops, total } = useMemo(
    () => buildPersonListRows(persons, query, rowOf, labelFor, grouped, t, sortByTime),
    [persons, query, rowOf, labelFor, grouped, sortByTime, t])

  // Render only the slice around the scroll position (plus an overscan).
  const visible = useMemo(() => {
    const out: Array<{ row: PersonListRow; top: number }> = []
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
