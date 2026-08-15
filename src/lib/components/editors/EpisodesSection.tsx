'use client'

import { useState } from 'react'
import { Episode, EpisodeType } from '@/types/charts'
import { useDataContext } from '@/context/DataContext'

interface Props {
  personId: string
  episodes: Episode[]
  onAdd: (ep: Omit<Episode, 'id'>) => void
  onUpdate: (id: string, updates: Partial<Episode>) => void
  onDelete: (id: string) => void
}

const EPISODE_TYPES: { value: EpisodeType; label: string; color: string }[] = [
  { value: 'event',   label: 'Event',   color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'article', label: 'Article', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { value: 'episode', label: 'Episode', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'note',    label: 'Note',    color: 'bg-amber-100 text-amber-700 border-amber-300' },
]

function typeConfig(t?: EpisodeType) {
  return EPISODE_TYPES.find((c) => c.value === t) ?? EPISODE_TYPES[3]
}

// ── inline add form ──────────────────────────────────────────────────────────

function AddForm({ personId, onAdd, onClose }: {
  personId: string
  onAdd: Props['onAdd']
  onClose: () => void
}) {
  const { t } = useDataContext()
  const [type, setType] = useState<EpisodeType>('event')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [url, setUrl] = useState('')

  const handleSubmit = () => {
    if (!title.trim()) return
    onAdd({
      personId,
      type,
      title: title.trim(),
      date: date || undefined,
      excerpt: excerpt || undefined,
      url: url || undefined,
    })
    onClose()
  }

  return (
    <div className="mt-2 border border-blue-200 rounded-lg p-3 bg-blue-50/40 space-y-2">
      <div className="flex gap-1 flex-wrap">
        {EPISODE_TYPES.map((epType) => (
          <button
            key={epType.value}
            type="button"
            onClick={() => setType(epType.value)}
            className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors ${
              type === epType.value ? epType.color : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            {t(epType.label, epType.label)}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder={t('Episode title placeholder', 'Title *')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <input
        type="text"
        placeholder={t('Episode date placeholder', 'Date (e.g. 2024-01)')}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <textarea
        placeholder={t('Episode excerpt placeholder', 'Excerpt / summary…')}
        value={excerpt}
        onChange={(e) => setExcerpt(e.target.value)}
        rows={2}
        className="w-full text-sm border border-gray-300 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <input
        type="url"
        placeholder={t('Episode URL placeholder', 'URL (optional)')}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 text-xs py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {t('Cancel', 'Cancel')}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!title.trim()}
          className="flex-1 text-xs py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 font-medium transition-colors"
        >
          {t('Add episode', 'Add')}
        </button>
      </div>
    </div>
  )
}

// ── single episode card ───────────────────────────────────────────────────────

function EpisodeCard({ episode, onUpdate, onDelete }: {
  episode: Episode
  onUpdate: (id: string, u: Partial<Episode>) => void
  onDelete: (id: string) => void
}) {
  const { t } = useDataContext()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(episode.title)
  const [date, setDate] = useState(episode.date ?? '')
  const [excerpt, setExcerpt] = useState(episode.excerpt ?? '')
  const [url, setUrl] = useState(episode.url ?? '')
  const cfg = typeConfig(episode.type)

  const handleSave = () => {
    onUpdate(episode.id, {
      title,
      date: date || undefined,
      excerpt: excerpt || undefined,
      url: url || undefined,
    })
    setEditing(false)
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Summary row */}
      <div
        className="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none hover:bg-gray-50 transition-colors"
        onClick={() => { setOpen((o) => !o); setEditing(false) }}
      >
        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${cfg.color}`}>
          {t(cfg.label, cfg.label)}
        </span>
        <span className="flex-1 truncate text-sm font-medium text-gray-800">{episode.title}</span>
        {episode.date && (
          <span className="text-xs text-gray-400 shrink-0">{episode.date}</span>
        )}
        <span className="text-gray-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(episode.id) }}
          className="shrink-0 text-gray-300 hover:text-red-400 transition-colors text-base leading-none"
          title={t('Delete episode title', 'Delete')}
        >
          ×
        </button>
      </div>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-gray-100 px-3 py-2.5 space-y-2 bg-gray-50">
          {editing ? (
            <>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('Title placeholder', 'Title')}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder={t('Date placeholder', 'Date')}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder={t('Excerpt placeholder', 'Excerpt…')}
                rows={3}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('URL placeholder', 'URL')}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 text-xs py-1 border border-gray-300 rounded text-gray-600 hover:bg-white transition-colors"
                >
                  {t('Cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 text-xs py-1 bg-blue-500 text-white rounded hover:bg-blue-600 font-medium transition-colors"
                >
                  {t('Save episode', 'Save')}
                </button>
              </div>
            </>
          ) : (
            <>
              {episode.excerpt ? (
                <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{episode.excerpt}</p>
              ) : (
                <p className="text-xs text-gray-400 italic">{t('No excerpt yet', 'No excerpt yet.')}</p>
              )}
              <div className="flex items-center gap-3">
                {episode.url && (
                  <a
                    href={episode.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                  >
                    {t('View link', '↗ View')}
                  </a>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditing(true) }}
                  className="text-xs text-gray-500 hover:text-gray-700 ml-auto transition-colors"
                >
                  {t('Edit episode', 'Edit')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── main export ───────────────────────────────────────────────────────────────

export function EpisodesSection({ personId, episodes, onAdd, onUpdate, onDelete }: Props) {
  const { t } = useDataContext()
  const [showForm, setShowForm] = useState(false)
  const mine = episodes.filter((e) => e.personId === personId)

  return (
    <div className="space-y-2">
      {mine.length === 0 && !showForm && (
        <p className="text-xs text-gray-400 italic py-1">{t('No episodes yet', 'No episodes or articles yet.')}</p>
      )}
      {mine.map((ep) => (
        <EpisodeCard key={ep.id} episode={ep} onUpdate={onUpdate} onDelete={onDelete} />
      ))}
      {showForm && (
        <AddForm personId={personId} onAdd={onAdd} onClose={() => setShowForm(false)} />
      )}
      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full mt-1 text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 hover:border-blue-500 rounded py-1.5 transition-colors"
        >
          {t('Add Episode', '+ Add Episode / Article')}
        </button>
      )}
    </div>
  )
}
