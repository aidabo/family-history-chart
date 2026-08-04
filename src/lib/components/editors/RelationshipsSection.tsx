'use client'

import { PersonNode, Relationship, RelationType } from '@/types/charts'
import { useDataContext } from '@/context/DataContext'

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
  'master':       'bg-orange-100 text-orange-800',
  'disciple':     'bg-yellow-100 text-yellow-700',
  'comrade':      'bg-teal-100 text-teal-700',
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
  'master':       '師匠',
  'disciple':     '弟子',
  'comrade':      '戦友',
  'rival':        '対立',
  'enemy':        '敵対',
  'custom':       'Cus',
}

// Full-word label used in the union-mediated descriptions
const REL_WORD: Record<string, string> = {
  'marriage': '結婚', 'remarriage': '再婚', 'sibling': '兄弟姉妹', 'succession': '継承',
  'friend': '親友', 'ally': '同盟', 'mentor': '師弟', 'rival': '対立', 'enemy': '敵対',
  'master': '師匠', 'disciple': '弟子', 'comrade': '戦友',
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
  const { t } = useDataContext()
  const getName = (id: string) => persons.find((p) => p.id === id)?.name ?? id
  const isUnionId = (id: string) => persons.find((p) => p.id === id)?.type === 'union'
  const unionType = (id: string): RelationType =>
    persons.find((p) => p.id === id)?.marriage?.type ?? 'marriage'

  // Translated badge label for a relationship type
  const badge = (type: string): string => {
    switch (type) {
      case 'parent-child': return t('PC badge', 'P–C')
      case 'marriage':     return t('Marriage', '結婚')
      case 'remarriage':   return t('Remarriage', '再婚')
      case 'partner':      return t('Partner badge', 'Par')
      case 'sibling':      return t('Sibling badge', '兄弟')
      case 'succession':   return t('Succession', '継承')
      case 'friend':       return t('Friend', '親友')
      case 'ally':         return t('Ally', '同盟')
      case 'mentor':       return t('Mentor', '師弟')
      case 'master':       return t('Master', '師匠')
      case 'disciple':     return t('Disciple', '弟子')
      case 'comrade':      return t('Comrade', '戦友')
      case 'rival':        return t('Rival', '対立')
      case 'enemy':        return t('Enemy', '敵対')
      case 'custom':       return t('Custom badge', 'Cus')
      default:             return TYPE_LABEL[type] ?? type
    }
  }

  // Translated full relationship word for union-mediated descriptions
  const relWord = (type: string): string => {
    switch (type) {
      case 'marriage':     return t('Marriage', '結婚')
      case 'remarriage':   return t('Remarriage', '再婚')
      case 'sibling':      return t('Sibling', '兄弟姉妹')
      case 'succession':   return t('Succession', '継承')
      case 'friend':       return t('Friend', '親友')
      case 'ally':         return t('Ally', '同盟')
      case 'mentor':       return t('Mentor', '師弟')
      case 'rival':        return t('Rival', '対立')
      case 'enemy':        return t('Enemy', '敵対')
      case 'master':       return t('Master', '師匠')
      case 'disciple':     return t('Disciple', '弟子')
      case 'comrade':      return t('Comrade', '戦友')
      case 'parent-child': return t('Parent-child pair', '親子')
      case 'custom':       return t('Custom rel', '関係')
      case 'partner':      return t('Partner', 'パートナー')
      default:             return type
    }
  }

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
      case 'marriage':     text = `${t('Marriage', '結婚')}: ${otherName}`; break
      case 'remarriage':   text = `${t('Remarriage', '再婚')}: ${otherName}`; break
      case 'parent-child': text = r.source === node.id ? `${t('Child', '子')}: ${otherName}` : `${t('Parent', '親')}: ${otherName}`; break
      case 'sibling':      text = `${t('Sibling', '兄弟姉妹')}: ${otherName}`; break
      case 'succession':   text = `${t('Succession', '継承')}: ${otherName}`; break
      case 'friend':       text = `${t('Friend', '親友')}: ${otherName}`; break
      case 'ally':         text = `${t('Ally', '同盟')}: ${otherName}`; break
      case 'mentor':       text = r.source === node.id ? `${t('Teacher', '師')}: ${otherName}` : `${t('Disciple', '弟子')}: ${otherName}`; break
      case 'master':       text = r.source === node.id ? `${t('Disciple', '弟子')}: ${otherName}` : `${t('Master', '師匠')}: ${otherName}`; break
      case 'disciple':     text = r.source === node.id ? `${t('Master', '師匠')}: ${otherName}` : `${t('Disciple', '弟子')}: ${otherName}`; break
      case 'comrade':      text = `${t('Comrade', '戦友')}: ${otherName}`; break
      case 'rival':        text = `${t('Rival', '対立')}: ${otherName}`; break
      case 'enemy':        text = `${t('Enemy', '敵対')}: ${otherName}`; break
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
        text: `${relWord(ut)}: ${getName(se.source)}`,
        removeId: pe.id,
        removeTitle: t('Remove union', 'この関係(union)を削除'),
      })
    }
    // Children hanging off this union
    for (const ke of relationships.filter((r) => r.type === 'parent-child' && r.source === uid)) {
      push({ key: `ch_${ke.id}`, badgeType: 'parent-child', text: `${t('Child', '子')}: ${getName(ke.target)}`, removeId: ke.id })
    }
  }

  // 3) Unions where this person is a child → parents (the union's partners)
  for (const pue of relationships.filter((r) => r.type === 'parent-child' && r.target === node.id && isUnionId(r.source))) {
    const uid = pue.source
    for (const pae of relationships.filter((r) => r.type === 'partner' && r.target === uid)) {
      push({ key: `par_${uid}_${pae.source}`, badgeType: 'parent-child', text: `${t('Parent', '親')}: ${getName(pae.source)}`, removeId: pue.id })
    }
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-xs text-gray-400 italic py-1">{t('No relationships yet', 'No relationships yet.')}</p>
      )}
      {items.map((it) => (
        <div key={it.key} className="flex items-center gap-2">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${TYPE_BADGE[it.badgeType] ?? 'bg-gray-100 text-gray-600'}`}>
            {badge(it.badgeType)}
          </span>
          <span className="flex-1 truncate text-sm text-gray-700">{it.text}</span>
          <button
            onClick={() => onRemove(it.removeId)}
            className="shrink-0 text-gray-400 hover:text-red-500 transition-colors text-base leading-none px-0.5"
            title={it.removeTitle ?? t('Remove', 'Remove')}
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={onStartConnect}
        className="w-full mt-1 text-xs text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 hover:border-blue-500 rounded py-1.5 transition-colors"
      >
        {t('Add Relationship', '+ Add Relationship')}
      </button>
    </div>
  )
}
