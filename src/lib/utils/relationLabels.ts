// Trilingual (ja / zh / en) labels for relationship types. Used two ways:
//  • relationLabel(type, locale)  → single, locale-specific label for canvas edge labels
//  • relationLabelMulti(type)     → "ja / zh / en" for pickers/lists (show all languages)
// See src/lib/types/charts.ts RelationType.

type Loc = 'ja' | 'zh' | 'en'

export const RELATION_LABELS: Record<string, { ja: string; zh: string; en: string }> = {
  'parent-child': { ja: '親子', zh: '亲子', en: 'Parent–Child' },
  'marriage':     { ja: '結婚', zh: '结婚', en: 'Marriage' },
  'remarriage':   { ja: '再婚', zh: '再婚', en: 'Remarriage' },
  'partner':      { ja: 'パートナー', zh: '伴侣', en: 'Partner' },
  'sibling':      { ja: '兄弟姉妹', zh: '兄弟姐妹', en: 'Sibling' },
  'succession':   { ja: '継承', zh: '继承', en: 'Succession' },
  'ally':         { ja: '同盟', zh: '同盟', en: 'Ally' },
  'rival':        { ja: '対立', zh: '对立', en: 'Rival' },
  'mentor':       { ja: '師弟', zh: '师徒', en: 'Mentor' },
  'enemy':        { ja: '敵対', zh: '敌对', en: 'Enemy' },
  'friend':       { ja: '親友', zh: '挚友', en: 'Friend' },
  'master':       { ja: '師匠', zh: '师傅', en: 'Master' },
  'disciple':     { ja: '弟子', zh: '弟子', en: 'Disciple' },
  'comrade':      { ja: '戦友', zh: '战友', en: 'Comrade' },
  'liege':        { ja: '君臣', zh: '君臣', en: 'Lord–Vassal' },
  'custom':       { ja: 'カスタム', zh: '自定义', en: 'Custom' },
}

export const normLocale = (l?: string): Loc =>
  l?.toLowerCase().startsWith('zh') ? 'zh' : l?.toLowerCase().startsWith('en') ? 'en' : 'ja'

// Single label in the given locale (falls back to Japanese).
export function relationLabel(type?: string, locale?: string): string {
  if (!type) return ''
  const m = RELATION_LABELS[type]
  if (!m) return ''
  return m[normLocale(locale)] || m.ja
}

// All languages joined "ja / zh / en" (duplicates collapsed — ja/zh are often identical).
export function relationLabelMulti(type?: string): string {
  if (!type) return ''
  const m = RELATION_LABELS[type]
  if (!m) return type
  return [m.ja, m.zh, m.en].filter((v, i, a) => a.indexOf(v) === i).join(' / ')
}
