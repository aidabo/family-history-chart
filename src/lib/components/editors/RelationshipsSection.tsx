'use client'

import { PersonNode, Relationship, RelationType } from '@/types/charts'

interface Props {
  node: PersonNode
  relationships: Relationship[]
  persons: PersonNode[]
  onRemove: (relId: string) => void
  onStartConnect: () => void
}

const TYPE_BADGE: Record<string, string> = {
  'parent-child': 'bg-blue-100 text-blue-700',
  'marriage':     'bg-pink-100 text-pink-700',
  'remarriage':   'bg-fuchsia-100 text-fuchsia-700',
  'partner':      'bg-purple-100 text-purple-700',
  'sibling':      'bg-green-100 text-green-700',
  'succession':   'bg-amber-100 text-amber-700',
  'friend':       'bg-emerald-100 text-emerald-700',
  'ally':         'bg-sky-100 text-sky-700',
  'mentor':       'bg-orange-100 text-orange-700',
  'rival':        'bg-rose-100 text-rose-700',
  'enemy':        'bg-red-100 text-red-700',
  'custom':       'bg-gray-100 text-gray-600',
}

const TYPE_LABEL: Record<string, string> = {
  'parent-child': 'P–C',
  'marriage':     '結婚',
  'remarriage':   '再婚',
  'partner':      'Par',
  'sibling':      '兄弟',
  'succession':   '継承',
  'friend':       '親友',
  'ally':         '同盟',
  'mentor':       '師弟',
  'rival':        '対立',
  'enemy':        '敵対',
  'custom':       'Cus',
}

// Full-word label used in the union-mediated descriptions
const REL_WORD: Record<string, string> = {
  'marriage': '結婚', 'remarriage': '再婚', 'sibling': '兄弟姉妹', 'succession': '継承',
  'friend': '親友', 'ally': '同盟', 'mentor': '師弟', 'rival': '対立', 'enemy': '敵対',
  'parent-child': '親子', 'custom': '関係', 'partner': 'パートナー',
}

interface DisplayRel {
  key: string
  badgeType: RelationType
  text: string
  removeId: string
  removeTitle?: string
}

export function RelationshipsSection({ node, relationships, persons, onRemove, onStartConnect }: Props) {
  const getName = (id: string) => persons.find((p) => p.id === id)?.name ?? id
  const isUnionId = (id: string) => persons.find((p) => p.id === id)?.type === 'union'
  const unionType = (id: string): RelationType =>
    persons.find((p) => p.id === id)?.marriage?.type ?? 'marriage'

  const items: DisplayRel[] = []
  const seen = new Set<string>()
  const push = (it: DisplayRel) => { if (!seen.has(it.key)) { seen.add(it.key); items.push(it) } }

  // 1) Direct edges to this person (skip partner edges and edges whose other end is a union —
  //    those are expanded below through the union).
  for (const r of relationships) {
    if (r.type === 'partner') continue
    if (r.source !== node.id && r.target !== node.id) continue
    const otherId = r.source === node.id ? r.target : r.source
    if (isUnionId(otherId)) continue
    const otherName = getName(otherId)
    let text: string
    switch (r.type) {
      case 'marriage':     text = `結婚: ${otherName}`; break
      case 'remarriage':   text = `再婚: ${otherName}`; break
      case 'parent-child': text = r.source === node.id ? `子: ${otherName}` : `親: ${otherName}`; break
      case 'sibling':      text = `兄弟姉妹: ${otherName}`; break
      case 'succession':   text = `継承: ${otherName}`; break
      case 'friend':       text = `親友: ${otherName}`; break
      case 'ally':         text = `同盟: ${otherName}`; break
      case 'mentor':       text = r.source === node.id ? `師: ${otherName}` : `弟子: ${otherName}`; break
      case 'rival':        text = `対立: ${otherName}`; break
      case 'enemy':        text = `敵対: ${otherName}`; break
      default:             text = `${r.label ?? r.type}: ${otherName}`
    }
    push({ key: r.id, badgeType: r.type, text, removeId: r.id })
  }

  // 2) Unions where this person is a partner → spouse/partner + children (via the union)
  const myUnions = relationships.filter((r) => r.type === 'partner' && r.source === node.id)
  for (const pe of myUnions) {
    const uid = pe.target
    const ut = unionType(uid)
    // Other partners on this union = spouse(s)
    for (const se of relationships.filter((r) => r.type === 'partner' && r.target === uid && r.source !== node.id)) {
      push({
        key: `sp_${uid}_${se.source}`,
        badgeType: ut,
        text: `${REL_WORD[ut] ?? '関係'}: ${getName(se.source)}`,
        removeId: pe.id,
        removeTitle: 'この関係(union)を削除',
      })
    }
    // Children hanging off this union
    for (const ke of relationships.filter((r) => r.type === 'parent-child' && r.source === uid)) {
      push({ key: `ch_${ke.id}`, badgeType: 'parent-child', text: `子: ${getName(ke.target)}`, removeId: ke.id })
    }
  }

  // 3) Unions where this person is a child → parents (the union's partners)
  for (const pue of relationships.filter((r) => r.type === 'parent-child' && r.target === node.id && isUnionId(r.source))) {
    const uid = pue.source
    for (const pae of relationships.filter((r) => r.type === 'partner' && r.target === uid)) {
      push({ key: `par_${uid}_${pae.source}`, badgeType: 'parent-child', text: `親: ${getName(pae.source)}`, removeId: pue.id })
    }
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-xs text-gray-400 italic py-1">No relationships yet.</p>
      )}
      {items.map((it) => (
        <div key={it.key} className="flex items-center gap-2">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${TYPE_BADGE[it.badgeType] ?? 'bg-gray-100 text-gray-600'}`}>
            {TYPE_LABEL[it.badgeType] ?? it.badgeType}
          </span>
          <span className="flex-1 truncate text-sm text-gray-700">{it.text}</span>
          <button
            onClick={() => onRemove(it.removeId)}
            className="shrink-0 text-gray-400 hover:text-red-500 transition-colors text-base leading-none px-0.5"
            title={it.removeTitle ?? 'Remove'}
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={onStartConnect}
        className="w-full mt-1 text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 hover:border-blue-500 rounded py-1.5 transition-colors"
      >
        + Add Relationship
      </button>
    </div>
  )
}
