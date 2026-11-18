// Edge appearance rules shared by the canvas and the CSV importer.
//
// 朝代更换 is stored as a `custom` edge whose label says which change it is. The CSV
// importer normalises it to '朝代更换', but a JSON file may use any of the aliases, so the
// display side treats all of them the same.

export const DYNASTY_CHANGE_LABELS = new Set(['朝代更换', '朝代更替', '换代'])

/** 継承の緑と分けるためのオレンジ（orange-600）。 */
export const DYNASTY_CHANGE_COLOR = '#ea580c'

export const isDynastyChange = (l: { type?: string; label?: string }): boolean =>
  l.type === 'custom' && !!l.label && DYNASTY_CHANGE_LABELS.has(l.label)

/**
 * Stroke width for an edge. ONE definition for the initial draw, the hover-out restore and
 * anything else: 朝代更换 is 3px (events share the same orange and stay 2px), siblings are
 * thinner, and an explicit `width` still wins.
 */
export const edgeWidth = (l: { type?: string; label?: string; width?: number }): number =>
  l.width || (isDynastyChange(l) ? 3 : l.type === 'sibling' ? 1.5 : 2)
