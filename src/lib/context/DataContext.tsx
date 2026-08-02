'use client'
import { createContext, useState, useContext, useMemo, useRef, ReactNode } from 'react'
import { createLayoutStore, LayoutStore } from '@/services/layoutStore'
import { ChartViewport, DrawStroke, Episode, PageProps, PersonNode, Relationship, VerticalTextMode, ViewSettings } from '@/types/charts'

// Injectable translate function; when a host supplies one, the library uses it, else identity.
export type TranslateFn = (key: string, fallback?: string) => string

interface DataState {
  dynasties: any[]
  persons: PersonNode[]
  relationships: Relationship[]
  episodes: Episode[]
  events: any[]
  drawings?: DrawStroke[]
  // Page-level view state + canvas background, persisted inside chartProps.
  viewport?: ChartViewport
  viewSettings?: ViewSettings
  background?: string
  backgroundImage?: string
  backgroundOpacity?: number
  verticalText?: VerticalTextMode
  dpi?: number
}

interface DataContextValue extends DataState {
  currentPage: PageProps | null
  loading: boolean
  setCurrentPage: (page: PageProps | null) => void
  loadPageList: () => Promise<PageProps[] | false>
  loadPage: (id: string) => Promise<PageProps | false>
  savePage: (patch?: { thumbnail?: string; viewport?: ChartViewport; viewSettings?: ViewSettings; background?: string; backgroundImage?: string; backgroundOpacity?: number; verticalText?: VerticalTextMode; dpi?: number }) => Promise<PageProps | false>
  insertPage: (data: PageProps) => Promise<PageProps | false>
  updatePage: (data: PageProps) => Promise<PageProps | false>
  deletePage: (id: string) => Promise<boolean>
  clearPage: () => void
  background?: string
  backgroundImage?: string
  backgroundOpacity?: number
  verticalText?: VerticalTextMode
  viewport?: ChartViewport
  viewSettings?: ViewSettings
  dpi?: number
  setBackground: (bg: string) => void
  setBackgroundImage: (url: string) => void
  setBackgroundOpacity: (n: number) => void
  setVerticalText: (m: VerticalTextMode) => void
  setDpi: (n: number) => void
  addPerson: (person: Partial<PersonNode>) => PersonNode
  addNote: (x?: number, y?: number) => PersonNode
  updatePerson: (id: string, updates: Partial<PersonNode>) => void
  deletePerson: (id: string) => void
  dissolveUnion: (unionId: string) => void
  updatePersonPosition: (id: string, x: number, y: number) => void
  updatePersonsBatch: (positions: Record<string, { x: number; y: number }>) => void
  addRelationship: (rel: Partial<Relationship>) => Relationship | undefined
  updateRelationship: (id: string, updates: Partial<Relationship>) => void
  deleteRelationship: (id: string) => void
  addEpisode: (ep: Omit<Episode, 'id'>) => Episode
  updateEpisode: (id: string, updates: Partial<Episode>) => void
  deleteEpisode: (id: string) => void
  addStroke: (stroke: DrawStroke) => void
  deleteStroke: (id: string) => void
  clearDrawings: () => void
  moveStrokes: (ids: string[], dx: number, dy: number) => void
  deleteStrokes: (ids: string[]) => void
  undoDraw: () => void
  redoDraw: () => void
  canUndoDraw: boolean
  canRedoDraw: boolean
  selectedNode: PersonNode | null
  setSelectedNode: (node: PersonNode | null) => void
  selectedRelationship: Relationship | null
  setSelectedRelationship: (rel: Relationship | null) => void
  uploadFile?: (file: File) => Promise<string>
  uploadThumbnail?: (chartId: string, blob: Blob) => Promise<string>
  thumbnailDpi?: number
  t: TranslateFn
  locale: string
}

const DataContext = createContext<DataContextValue | null>(null)

interface DataProviderProps {
  children: ReactNode
  apiBaseUrl?: string
  uploadFile?: (file: File) => Promise<string>
  uploadThumbnail?: (chartId: string, blob: Blob) => Promise<string>
  thumbnailDpi?: number             // A4-landscape thumbnail DPI (default 150; host may set via env)
  // Host injection points (all optional — the library stays standalone without them):
  store?: LayoutStore              // replaces the built-in REST layoutStore (e.g. host social_charts API)
  t?: TranslateFn                  // host translate; defaults to identity (returns fallback ?? key)
  locale?: string                  // host locale; defaults to 'ja'
}

// Short unique suffix (uuid-based, falls back to random). Kept short for readability.
let __idSeq = 0
const shortId = (): string => {
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2)
  return (rnd + (__idSeq++).toString(36)).slice(0, 8)
}
// DOM-safe slug from a name (used in SVG ids like clip-<id>): keep letters/digits/CJK, drop the rest
const slug = (name?: string): string =>
  (name ?? '').trim().replace(/[\s#()<>"'`.,/\\:;{}[\]|?&=+%]/g, '').slice(0, 24)
// Readable + unique: "<name>_<shortid>" for persons; "<prefix>_<shortid>" otherwise
const personId = (name?: string) => `${slug(name) || 'p'}_${shortId()}`
const uid = (prefix: string) => `${prefix}_${shortId()}`

export function DataProvider({
  children, apiBaseUrl = '/api/charts', uploadFile, uploadThumbnail, thumbnailDpi = 150,
  store: providedStore, t: providedT, locale = 'ja',
}: DataProviderProps) {
  // Host-provided store wins; otherwise fall back to the built-in REST layoutStore.
  const store = useMemo(
    () => providedStore ?? createLayoutStore(apiBaseUrl),
    [providedStore, apiBaseUrl],
  )
  const t = useMemo<TranslateFn>(
    () => providedT ?? ((key, fallback) => fallback ?? key),
    [providedT],
  )

  const [currentPage, setCurrentPage] = useState<PageProps | null>(null)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DataState>({
    dynasties: [],
    persons: [],
    relationships: [],
    episodes: [],
    events: [],
  })
  const [selectedNode, setSelectedNode] = useState<PersonNode | null>(null)
  const [selectedRelationship, setSelectedRelationship] = useState<Relationship | null>(null)

  // Whiteboard drawing undo/redo history (snapshots of the drawings array).
  const [drawHistory, setDrawHistory] = useState<{ undo: DrawStroke[][]; redo: DrawStroke[][] }>({ undo: [], redo: [] })
  const drawingsRef = useRef<DrawStroke[]>(data.drawings ?? [])
  drawingsRef.current = data.drawings ?? []
  const drawHistRef = useRef(drawHistory)
  drawHistRef.current = drawHistory

  const loadPageList = async () => {
    setLoading(true)
    try {
      return await store.getPageList()
    } finally {
      setLoading(false)
    }
  }

  const loadPage = async (pageId: string) => {
    setLoading(true)
    try {
      const page = await store.getPageById(pageId)
      if (page) {
        setCurrentPage(page)
        setData({ episodes: [], drawings: [], ...page.chartProps })
      }
      return page
    } finally {
      setLoading(false)
    }
  }

  const savePage = async (patch?: { thumbnail?: string; viewport?: ChartViewport; viewSettings?: ViewSettings; background?: string; backgroundImage?: string; backgroundOpacity?: number; verticalText?: VerticalTextMode; dpi?: number }) => {
    if (!currentPage?.id) return false
    // thumbnail is a page-level column; viewport/background/dpi live inside chartProps.
    const chartProps = {
      ...data,
      ...(patch?.viewport !== undefined ? { viewport: patch.viewport } : {}),
      ...(patch?.viewSettings !== undefined ? { viewSettings: patch.viewSettings } : {}),
      ...(patch?.background !== undefined ? { background: patch.background } : {}),
      ...(patch?.backgroundImage !== undefined ? { backgroundImage: patch.backgroundImage } : {}),
      ...(patch?.backgroundOpacity !== undefined ? { backgroundOpacity: patch.backgroundOpacity } : {}),
      ...(patch?.verticalText !== undefined ? { verticalText: patch.verticalText } : {}),
      ...(patch?.dpi !== undefined ? { dpi: patch.dpi } : {}),
    }
    const pageData = {
      ...currentPage,
      ...(patch?.thumbnail !== undefined ? { thumbnail: patch.thumbnail } : {}),
      chartProps,
    }
    const saved = await store.savePage(pageData)
    if (saved) {
      // Update page metadata (id/thumbnail/etc.) but DON'T replace `data`: it already
      // holds the saved state, and re-setting it from the server response would create
      // new array refs → a full canvas rebuild (all nodes flash) on every Save.
      setCurrentPage((prev) => ({ ...saved, chartProps: prev?.chartProps ?? saved.chartProps }))
    }
    return saved
  }

  const insertPage = async (pageData: PageProps) => {
    const newPage = await store.insertPage(pageData)
    if (newPage) {
      setCurrentPage(newPage)
      setData(newPage.chartProps)
    }
    return newPage
  }

  const updatePage = async (pageProps: PageProps) => {
    const saved = await store.updatePage(pageProps)
    if (saved) {
      setCurrentPage((prev) => ({ ...prev!, ...saved }))
    }
    return saved
  }

  const deletePage = async (pageId: string) => {
    const ok = await store.deletePage(pageId)
    if (ok) {
      setCurrentPage(null)
      setData({ dynasties: [], persons: [], relationships: [], episodes: [], events: [] })
    }
    return ok
  }

  const clearPage = () => {
    const empty: DataState = { dynasties: [], persons: [], relationships: [], episodes: [], events: [] }
    setData(empty)
    if (currentPage) setCurrentPage({ ...currentPage, chartProps: empty })
  }

  const setBackground = (bg: string) => {
    setData((prev) => ({ ...prev, background: bg }))
  }

  const setBackgroundImage = (url: string) => {
    setData((prev) => ({ ...prev, backgroundImage: url }))
  }

  const setBackgroundOpacity = (n: number) => {
    setData((prev) => ({ ...prev, backgroundOpacity: n }))
  }

  const setVerticalText = (m: VerticalTextMode) => {
    setData((prev) => ({ ...prev, verticalText: m }))
  }

  const setDpi = (n: number) => {
    setData((prev) => ({ ...prev, dpi: n }))
  }

  // Free-standing annotation/note (reuses the description text-box machinery).
  const addNote = (x?: number, y?: number): PersonNode => {
    const px = x ?? 400
    const py = y ?? 300
    const note: PersonNode = {
      id: uid('note'),
      type: 'note',
      name: '',
      description: 'メモ',
      noteShape: 'sticky',
      descriptionWidth: 180,
      x: px, y: py, fx: px, fy: py,
    }
    setData((prev) => ({ ...prev, persons: [...prev.persons, note] }))
    return note
  }

  const addPerson = (person: Partial<PersonNode>): PersonNode => {
    const last = data.persons.filter((p) => p.fx != null && p.fy != null).at(-1)
    const autoX = last ? (last.fx ?? 400) + 90 : 400
    const autoY = last ? (last.fy ?? 300) + 90 : 300
    const newPerson: PersonNode = {
      name: 'New Person',
      shape: 'circle',
      nodeSize: 40,
      ...person,
      id: personId(person.type === 'union' ? 'union' : person.name),
      fx: person.fx != null ? person.fx : autoX,
      fy: person.fy != null ? person.fy : autoY,
      x:  person.x  != null ? person.x  : autoX,
      y:  person.y  != null ? person.y  : autoY,
    }
    setData((prev) => ({ ...prev, persons: [...prev.persons, newPerson] }))
    return newPerson
  }

  // ── Whiteboard / annotation drawings (with undo/redo history) ──
  // Snapshot the current drawings onto the undo stack before a mutation; a new edit
  // clears the redo stack. Capped so the history can't grow without bound.
  const recordDrawSnapshot = () => {
    setDrawHistory((h) => ({ undo: [...h.undo, drawingsRef.current].slice(-100), redo: [] }))
  }

  const addStroke = (stroke: DrawStroke) => {
    recordDrawSnapshot()
    setData((prev) => ({ ...prev, drawings: [...(prev.drawings ?? []), stroke] }))
  }

  const deleteStroke = (id: string) => {
    recordDrawSnapshot()
    setData((prev) => ({ ...prev, drawings: (prev.drawings ?? []).filter((s) => s.id !== id) }))
  }

  const clearDrawings = () => {
    if (!drawingsRef.current.length) return
    recordDrawSnapshot()
    setData((prev) => ({ ...prev, drawings: [] }))
  }

  // Translate a set of strokes by (dx,dy). Snapshots for undo like any other edit.
  const moveStrokes = (ids: string[], dx: number, dy: number) => {
    if (!ids.length || (dx === 0 && dy === 0)) return
    const idSet = new Set(ids)
    recordDrawSnapshot()
    setData((prev) => ({
      ...prev,
      drawings: (prev.drawings ?? []).map((s) =>
        idSet.has(s.id)
          ? { ...s, points: s.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) }
          : s,
      ),
    }))
  }

  const deleteStrokes = (ids: string[]) => {
    if (!ids.length) return
    const idSet = new Set(ids)
    recordDrawSnapshot()
    setData((prev) => ({ ...prev, drawings: (prev.drawings ?? []).filter((s) => !idSet.has(s.id)) }))
  }

  const undoDraw = () => {
    const h = drawHistRef.current
    if (!h.undo.length) return
    const target = h.undo[h.undo.length - 1]
    const current = drawingsRef.current
    setData((prev) => ({ ...prev, drawings: target }))
    setDrawHistory({ undo: h.undo.slice(0, -1), redo: [...h.redo, current] })
  }

  const redoDraw = () => {
    const h = drawHistRef.current
    if (!h.redo.length) return
    const target = h.redo[h.redo.length - 1]
    const current = drawingsRef.current
    setData((prev) => ({ ...prev, drawings: target }))
    setDrawHistory({ undo: [...h.undo, current], redo: h.redo.slice(0, -1) })
  }

  const updatePerson = (id: string, updates: Partial<PersonNode>) => {
    setData((prev) => ({
      ...prev,
      persons: prev.persons.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }))
    setSelectedNode((prev) => (prev?.id === id ? { ...prev, ...updates } : prev))
  }

  // Dissolve a union: remove the union node + its partner edges, restore a direct
  // edge between the two partners, and reconnect the union's children to BOTH partners.
  const dissolveUnion = (unionId: string) => {
    setData((prev) => {
      const union = prev.persons.find((p) => p.id === unionId)
      if (!union || union.type !== 'union') return prev

      const partnerRels = prev.relationships.filter((r) => r.type === 'partner' && r.target === unionId)
      const partnerIds = partnerRels.map((r) => r.source)
      const childRels = prev.relationships.filter((r) => r.type === 'parent-child' && r.source === unionId)
      const childIds = childRels.map((r) => r.target)

      const stamp = Date.now()
      const newRels: Relationship[] = []

      // Restore direct edge between the (first two) partners
      const relType = union.marriage?.type ?? 'marriage'
      if (partnerIds.length >= 2) {
        newRels.push({
          id: `rel_${stamp}_d0`,
          source: partnerIds[0],
          target: partnerIds[1],
          type: relType,
          label: union.marriage?.label,
          start: union.marriage?.start,
          end: union.marriage?.end,
        })
      }
      // Reconnect each child to every partner as parent-child
      let k = 1
      for (const childId of childIds) {
        for (const partnerId of partnerIds) {
          newRels.push({ id: `rel_${stamp}_d${k++}`, source: partnerId, target: childId, type: 'parent-child' })
        }
      }

      return {
        ...prev,
        persons: prev.persons.filter((p) => p.id !== unionId),
        relationships: [
          ...prev.relationships.filter((r) => r.source !== unionId && r.target !== unionId),
          ...newRels,
        ],
      }
    })
    setSelectedNode((prev) => (prev?.id === unionId ? null : prev))
  }

  const deletePerson = (id: string) => {
    setData((prev) => {
      const person = prev.persons.find((p) => p.id === id)
      let rels = [...prev.relationships]
      let people = [...prev.persons]

      if (person?.type === 'union') {
        rels = rels.filter((r) => !(r.target === id && r.type === 'partner'))
      } else {
        // Remove union nodes for marriages involving this person
        const partnerRels = rels.filter((r) => r.source === id && r.type === 'partner')
        partnerRels.forEach((r) => {
          people = people.filter((p) => p.id !== r.target)
          rels = rels.filter((rel) => !(rel.target === r.target && rel.type === 'partner'))
        })
      }

      return {
        ...prev,
        persons: people.filter((p) => p.id !== id),
        relationships: rels.filter((r) => r.source !== id && r.target !== id),
      }
    })
    setSelectedNode((prev) => (prev?.id === id ? null : prev))
  }

  const updatePersonPosition = (id: string, x: number, y: number) => {
    setData((prev) => ({
      ...prev,
      persons: prev.persons.map((p) => (p.id === id ? { ...p, x, y, fx: x, fy: y } : p)),
    }))
  }

  const updatePersonsBatch = (positions: Record<string, { x: number; y: number }>) => {
    setData((prev) => ({
      ...prev,
      persons: prev.persons.map((p) => {
        const pos = positions[p.id]
        return pos ? { ...p, x: pos.x, y: pos.y, fx: pos.x, fy: pos.y } : p
      }),
    }))
  }

  const addRelationship = (rel: Partial<Relationship>): Relationship | undefined => {
    // Union nodes are created explicitly via the dialog/EdgeCard checkbox, not auto-created here.
    const newRel: Relationship = {
      source: '',
      target: '',
      type: 'parent-child',
      ...rel,
      id: uid('rel'),
    }
    setData((prev) => ({ ...prev, relationships: [...prev.relationships, newRel] }))
    return newRel
  }

  const updateRelationship = (id: string, updates: Partial<Relationship>) => {
    setData((prev) => ({
      ...prev,
      relationships: prev.relationships.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    }))
    setSelectedRelationship((prev) => (prev?.id === id ? { ...prev, ...updates } : prev))
  }

  const deleteRelationship = (id: string) => {
    setData((prev) => {
      const rel = prev.relationships.find((r) => r.id === id)
      if (rel?.type === 'partner') {
        const unionId = rel.target
        return {
          ...prev,
          persons: prev.persons.filter((p) => p.id !== unionId),
          relationships: prev.relationships.filter(
            (r) => r.id !== id && r.target !== unionId
          ),
        }
      }
      return { ...prev, relationships: prev.relationships.filter((r) => r.id !== id) }
    })
  }

  const addEpisode = (ep: Omit<Episode, 'id'>): Episode => {
    const newEp: Episode = { ...ep, id: uid('ep') }
    setData((prev) => ({ ...prev, episodes: [...prev.episodes, newEp] }))
    return newEp
  }

  const updateEpisode = (id: string, updates: Partial<Episode>) => {
    setData((prev) => ({
      ...prev,
      episodes: prev.episodes.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }))
  }

  const deleteEpisode = (id: string) => {
    setData((prev) => ({ ...prev, episodes: prev.episodes.filter((e) => e.id !== id) }))
  }

  return (
    <DataContext.Provider
      value={{
        ...data,
        currentPage,
        loading,
        setCurrentPage,
        loadPageList,
        loadPage,
        savePage,
        insertPage,
        updatePage,
        deletePage,
        clearPage,
        background: data.background,
        backgroundImage: data.backgroundImage,
        backgroundOpacity: data.backgroundOpacity,
        verticalText: data.verticalText,
        viewport: data.viewport,
        viewSettings: data.viewSettings,
        dpi: data.dpi,
        setBackground,
        setBackgroundImage,
        setBackgroundOpacity,
        setVerticalText,
        setDpi,
        addPerson,
        addNote,
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
        addStroke,
        deleteStroke,
        clearDrawings,
        moveStrokes,
        deleteStrokes,
        undoDraw,
        redoDraw,
        canUndoDraw: drawHistory.undo.length > 0,
        canRedoDraw: drawHistory.redo.length > 0,
        selectedNode,
        setSelectedNode,
        selectedRelationship,
        setSelectedRelationship,
        uploadFile,
        uploadThumbnail,
        thumbnailDpi,
        t,
        locale,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}

export function useDataContext() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useDataContext must be used within DataProvider')
  return ctx
}
