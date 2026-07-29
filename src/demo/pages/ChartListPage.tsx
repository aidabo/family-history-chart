import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDataContext } from '@/context/DataContext'
import { PageProps } from '@/types/charts'
import {
  PencilIcon,
  EyeIcon,
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline'
import { v4 as uuidv4 } from 'uuid'
import { PageInfoDialog } from '@/components/charts/PageInfoDialog'

export default function ChartListPage() {
  const [pages, setPages] = useState<PageProps[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingPage, setEditingPage] = useState<PageProps | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { loadPageList, updatePage, deletePage, insertPage } = useDataContext()
  const navigate = useNavigate()

  const refresh = async () => {
    setLoading(true)
    const result = await loadPageList()
    if (result !== false) setPages(result)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const handleCreate = () => { setEditingPage(null); setIsDialogOpen(true) }

  const handleEdit = (pageId: string) => {
    const page = pages.find((p) => p.id === pageId)
    if (page) { setEditingPage(page); setIsDialogOpen(true) }
  }

  const handleOpen = (pageId: string) => navigate(`/edit/${pageId}`)

  const handleDelete = async (pageId: string) => {
    if (!window.confirm('Delete this chart page?')) return
    await deletePage(pageId)
    setPages((prev) => prev.filter((p) => p.id !== pageId))
  }

  const handleView = (pageId: string) => navigate(`/edit/${pageId}?mode=view`)

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

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text) as Partial<PageProps>
      if (!data.chartProps) throw new Error('missing chartProps')
      const newPage: PageProps = {
        id: uuidv4(),
        title: data.title || file.name.replace(/\.json$/i, ''),
        image: data.image || '',
        options: data.options || {},
        chartProps: {
          dynasties: data.chartProps.dynasties || [],
          persons: data.chartProps.persons || [],
          relationships: data.chartProps.relationships || [],
          episodes: data.chartProps.episodes || [],
          events: data.chartProps.events || [],
        },
      }
      const created = await insertPage(newPage)
      await refresh()
      if (created) navigate(`/edit/${created.id}`)
    } catch {
      alert('Invalid JSON file. Expected a chart export with chartProps.')
    }
    e.target.value = ''
  }

  const handleDialogSubmit = async (data: { title: string; image: string }) => {
    let pageId = editingPage?.id
    if (editingPage) {
      const updated = { ...editingPage, title: data.title, image: data.image }
      await updatePage(updated)
    } else {
      const newPage: PageProps = {
        id: uuidv4(),
        title: data.title,
        image: data.image,
        options: {},
        chartProps: { dynasties: [], persons: [], relationships: [], episodes: [], events: [] },
      }
      const created = await insertPage(newPage)
      pageId = created ? created.id : undefined
    }
    await refresh()
    setIsDialogOpen(false)
    if (!editingPage && pageId) navigate(`/edit/${pageId}`)
  }

  return (
    <>
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Dynasty History Charts</h1>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportFile}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors border border-gray-200"
                title="Import chart from JSON"
              >
                <ArrowUpTrayIcon className="h-4 w-4" />
                Import
              </button>
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                <PlusIcon className="h-5 w-5" />
                New Chart
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-12">Loading…</div>
          ) : pages.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              No charts yet. Create your first one!
            </div>
          ) : (
            <div className="space-y-3">
              {pages.map((page) => (
                <div
                  key={page.id}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <img
                    src={page.image && !page.image.startsWith('data:') ? page.image : '/assets/page.svg'}
                    alt={page.title}
                    className="w-10 h-10 rounded-full object-cover bg-gray-200 flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).src = '/assets/page.svg' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">{page.title}</div>
                    <div className="text-xs text-gray-400 truncate">{page.id}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEdit(page.id)}
                      className="p-2 text-blue-500 hover:bg-blue-50 rounded-full"
                      title="Edit info"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleOpen(page.id)}
                      className="p-2 text-blue-500 hover:bg-blue-50 rounded-full"
                      title="Open editor"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleView(page.id)}
                      className="p-2 text-green-500 hover:bg-green-50 rounded-full"
                      title="View"
                    >
                      <EyeIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleExportPage(page)}
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"
                      title="Export as JSON"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(page.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-full"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
