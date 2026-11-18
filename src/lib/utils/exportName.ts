// Download filename for an exported chart. Keep the chart's own name (Japanese, Chinese,
// Korean, emoji … all allowed) and only replace characters a filesystem cannot take.
// The previous rule stripped every non-ASCII character, so "西遊記" exported as "____.json".
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g

export function chartExportFileName(title: string | undefined, ext: 'json' | 'csv'): string {
  const base = String(title ?? '')
    .replace(ILLEGAL, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')   // no leading/trailing dots or spaces
    .slice(0, 120)                      // stay well inside OS filename limits
  return `${base || 'chart'}.${ext}`
}
