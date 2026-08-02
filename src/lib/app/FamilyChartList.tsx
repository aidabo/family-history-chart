import { useState, useEffect } from 'react'
import { useDataContext } from '@/context/DataContext'
import { PageProps } from '@/types/charts'
import {
  PencilIcon,
  EyeIcon,
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  ArrowDownTrayIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline'
import { v4 as uuidv4 } from 'uuid'
import { PageInfoDialog } from '@/components/charts/PageInfoDialog'

// Self-contained inline placeholder (no external /assets request, so no 404 loop when
// a chart has no image or its image fails to load).
const CHART_PLACEHOLDER =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>" +
  "<circle cx='20' cy='20' r='20' fill='%23d1d5db'/>" +
  "<circle cx='20' cy='15' r='5' fill='%239ca3af'/>" +
  "<path d='M11 28c0-4 4-6 9-6s9 2 9 6' fill='%239ca3af'/></svg>"

export interface FamilyChartListProps {
  onOpen: (id: string) => void
  onView: (id: string) => void
}

export default function FamilyChartList({ onOpen, onView }: FamilyChartListProps) {
  const [pages, setPages] = useState<PageProps[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingPage, setEditingPage] = useState<PageProps | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const { loadPageList, loadPage, updatePage, deletePage, insertPage, t } = useDataContext()

  const statusLabel = (s?: string) => (s === 'published' ? t('Published') : t('Drafts'))

  // Most-recently-updated charts first. Falls back to created_at, then keeps a stable
  // order (the store may already sort server-side; this makes it deterministic anyway).
  const stamp = (p: PageProps) => new Date(p.updated_at ?? p.created_at ?? 0).getTime() || 0

  const refresh = async () => {
    setLoading(true)
    const result = await loadPageList()
    if (result !== false) setPages([...result].sort((a, b) => stamp(b) - stamp(a)))
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const handleCreate = () => { setEditingPage(null); setIsDialogOpen(true) }

  const handleEdit = (pageId: string) => {
    const page = pages.find((p) => p.id === pageId)
    if (page) { setEditingPage(page); setIsDialogOpen(true) }
  }

  const handleOpen = (pageId: string) => onOpen(pageId)

  const handleDelete = async (pageId: string) => {
    if (!window.confirm('Delete this chart page?')) return
    await deletePage(pageId)
    setPages((prev) => prev.filter((p) => p.id !== pageId))
  }

  const handleView = (pageId: string) => onView(pageId)

  const handleExportPage = (page: PageProps) => {
    const json = JSON.stringify(page, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(page.title || 'chart').replace(/[^a-z0-9]/gi, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Duplicate a chart: re-fetch the FULL page from the API (so every chartProps field —
  // persons, relationships, drawings, viewSettings, background, … — is included), then
  // register it as a brand-new page with "copy" appended to the id and title.
  const handleDuplicate = async (pageId: string) => {
    setNotice('複製中…')
    const full = await loadPage(pageId)
    if (!full) { setNotice(null); alert('複製元の取得に失敗しました。'); return }
    let newId = `${full.id}-copy`
    for (let n = 2; pages.some((p) => p.id === newId); n++) newId = `${full.id}-copy-${n}`
    const copy: PageProps = {
      ...full,
      id: newId,
      title: `${full.title || 'Chart'} copy`,
      chartProps: { ...full.chartProps },  // carry ALL fields verbatim
    }
    const created = await insertPage(copy)
    await refresh()
    if (created) {
      setNotice(`「${copy.title}」を作成しました`)
      setTimeout(() => setNotice(null), 3000)
    } else {
      setNotice(null)
      alert('複製に失敗しました。')
    }
  }

  const handleDialogSubmit = async (data: { title: string; image: string; status: 'published' | 'draft'; category: string }) => {
    let pageId = editingPage?.id
    if (editingPage) {
      const updated = { ...editingPage, title: data.title, image: data.image, status: data.status, category: data.category }
      await updatePage(updated)
    } else {
      const newPage: PageProps = {
        id: uuidv4(),
        title: data.title,
        image: data.image,
        status: data.status,
        category: data.category,
        options: {},
        chartProps: { dynasties: [], persons: [], relationships: [], episodes: [], events: [] },
      }
      const created = await insertPage(newPage)
      pageId = created ? created.id : undefined
    }
    await refresh()
    setIsDialogOpen(false)
    if (!editingPage && pageId) onOpen(pageId)
  }

  const chartImg = (page: PageProps) => (
    <img
      src={page.image || CHART_PLACEHOLDER}
      alt={page.title}
      className="w-12 h-12 rounded-full object-cover bg-gray-200 flex-shrink-0"
      onError={(e) => {
        const img = e.target as HTMLImageElement
        img.onerror = null // stop retry loop
        img.src = CHART_PLACEHOLDER
      }}
    />
  )

  const badges = (page: PageProps) => (
    <>
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium leading-tight ${
          page.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
        }`}
      >
        {statusLabel(page.status)}
      </span>
      {page.category && (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium leading-tight bg-blue-100 text-blue-800 capitalize">
          {page.category}
        </span>
      )}
    </>
  )

  return (
    <>
      {notice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {notice}
        </div>
      )}
      <div className="w-full p-4 min-h-screen bg-gray-50">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h2 className="text-2xl font-bold text-gray-800 leading-tight">
            {t('Dynasty History Charts')} ({pages.length})
          </h2>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2.5 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg transition-colors shadow-sm w-full sm:w-auto justify-center text-base font-medium"
          >
            <PlusIcon className="h-4 w-4" />
            <span>{t('New Chart')}</span>
          </button>
        </div>

        <hr className="border-gray-300 mb-4" />

        {/* List */}
        <div className="space-y-1">
          {pages.map((page) => (
            <div key={page.id} className="border-b border-black/10 transition-colors duration-200 overflow-hidden">
              <div className="p-2.5">
                {/* PC: one line */}
                <div className="hidden md:flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    {chartImg(page)}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="font-bold text-lg text-gray-900 truncate leading-tight">
                        {page.title}
                        <button
                          onClick={() => handleEdit(page.id)}
                          className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition-colors flex-shrink-0 ml-2"
                          title={t('Edit Info')}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 flex-shrink-0">{badges(page)}</div>

                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => handleOpen(page.id)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title={t('Edit Content')}>
                      <div className="flex"><PencilSquareIcon className="h-4 w-4 mr-1.5" /><span className="text-sm leading-none">{t('Edit')}</span></div>
                    </button>
                    <button onClick={() => handleView(page.id)} className="p-2 text-purple-500 hover:bg-purple-50 rounded-lg transition-colors" title={t('Preview')}>
                      <div className="flex"><EyeIcon className="h-4 w-4 mr-1.5" /><span className="text-sm leading-none">{t('Preview')}</span></div>
                    </button>
                    <button onClick={() => handleDuplicate(page.id)} className="p-2 text-cyan-500 hover:bg-cyan-50 rounded-lg transition-colors" title={t('Duplicate')}>
                      <div className="flex"><DocumentDuplicateIcon className="h-4 w-4 mr-1.5" /><span className="text-sm leading-none">{t('Duplicate')}</span></div>
                    </button>
                    <button onClick={() => handleExportPage(page)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors" title={t('Export')}>
                      <div className="flex"><ArrowDownTrayIcon className="h-4 w-4 mr-1.5" /><span className="text-sm leading-none">{t('Export')}</span></div>
                    </button>
                    <button onClick={() => handleDelete(page.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title={t('Delete')}>
                      <div className="flex"><TrashIcon className="h-4 w-4 mr-1.5" /><span className="text-sm leading-none">{t('Delete')}</span></div>
                    </button>
                  </div>
                </div>

                {/* Mobile: two lines */}
                <div className="md:hidden">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    {chartImg(page)}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="font-bold text-base text-gray-900 truncate leading-tight flex-1 min-w-0">{page.title}</div>
                      <button onClick={() => handleEdit(page.id)} className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition-colors flex-shrink-0" title={t('Edit Info')}>
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center border-t border-gray-100 pt-2 gap-2">
                    <div className="flex gap-2 flex-wrap">{badges(page)}</div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => handleOpen(page.id)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title={t('Edit Content')}><PencilSquareIcon className="h-4 w-4" /></button>
                      <button onClick={() => handleView(page.id)} className="p-2 text-purple-500 hover:bg-purple-50 rounded-lg transition-colors" title={t('Preview')}><EyeIcon className="h-4 w-4" /></button>
                      <button onClick={() => handleDuplicate(page.id)} className="p-2 text-cyan-500 hover:bg-cyan-50 rounded-lg transition-colors" title={t('Duplicate')}><DocumentDuplicateIcon className="h-4 w-4" /></button>
                      <button onClick={() => handleExportPage(page)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors" title={t('Export')}><ArrowDownTrayIcon className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(page.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title={t('Delete')}><TrashIcon className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {pages.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-400">
            {t('No charts yet. Create your first one!')}
          </div>
        )}

        {/* Loading state */}
        {loading && <div className="text-center py-12 text-gray-400">{t('Loading…')}</div>}
      </div>

      {isDialogOpen && (
        <PageInfoDialog
          open={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onSubmit={handleDialogSubmit}
          initialData={(editingPage || undefined) as any}
        />
      )}
    </>
  )
}
