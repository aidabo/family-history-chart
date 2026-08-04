'use client'

import { PersonNode } from '@/types/charts'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { useDataContext } from '@/context/DataContext'

interface Props {
  node: PersonNode
  onChange: (updates: Partial<PersonNode>) => void
}

export function DescriptionSection({ node, onChange }: Props) {
  const { t } = useDataContext()
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">{t('Description', 'Description')}</label>
        <textarea
          defaultValue={node.description ?? ''}
          onBlur={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder={t('Add description placeholder', 'Add a description...')}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1 resize-y focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {/* Default position (initial snap, overridden by drag) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">{t('Default Position', 'Default Position')}</label>
          {(node.descriptionOffsetX != null || node.descriptionOffsetY != null) && (
            <button
              type="button"
              onClick={() => onChange({ descriptionOffsetX: undefined, descriptionOffsetY: undefined })}
              className="text-xs text-blue-500 hover:text-blue-700 underline"
            >
              {t('Reset drag', 'Reset drag')}
            </button>
          )}
        </div>
        <div className="flex gap-4">
          {(['below', 'right'] as const).map((pos) => (
            <label key={pos} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name={`descPos-${node.id}`}
                value={pos}
                checked={(node.descriptionPosition ?? 'below') === pos}
                onChange={() => onChange({
                  descriptionPosition: pos,
                  descriptionOffsetX: undefined,
                  descriptionOffsetY: undefined,
                })}
              />
              {pos.charAt(0).toUpperCase() + pos.slice(1)}
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">{t('Drag description hint', 'Drag description on canvas to reposition')}</p>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-0.5">
          {t('Width', 'Width')}: {node.descriptionWidth ?? 160}px
        </label>
        <input
          type="range" min={80} max={300}
          value={node.descriptionWidth ?? 160}
          onChange={(e) => onChange({ descriptionWidth: Number(e.target.value) })}
          className="w-full"
        />
        <p className="text-[11px] text-gray-400 mt-0.5">{t('Description width hint', '画面上の青ハンドルでも調整可（横書き＝右端で幅、縦書き＝下端で高さ）。枠は文字にフィットします。')}</p>
      </div>

      {/* Frame (border) toggle */}
      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={!!node.descriptionBorder}
          onChange={(e) => onChange({ descriptionBorder: e.target.checked })}
          className="accent-blue-600"
        />
        {t('Show border', '枠を表示')}
      </label>

      {/* Description background */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">{t('Background', 'Background')}</label>
        <div className="flex gap-1 mb-1.5">
          {(['none', 'rect', 'pill'] as const).map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => onChange({
                descriptionBgShape: val === 'none' ? undefined : val,
                descriptionBgColor: val === 'none' ? undefined : (node.descriptionBgColor || 'rgba(255,255,255,0.9)'),
              })}
              className={`flex-1 text-xs py-1 rounded border transition-colors ${
                (val === 'none' ? !node.descriptionBgShape : node.descriptionBgShape === val)
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {val === 'none' ? t('None', 'None') : val === 'rect' ? t('Rect', 'Rect') : t('Pill', 'Pill')}
            </button>
          ))}
        </div>
        {node.descriptionBgShape && (
          <ColorPicker
            value={node.descriptionBgColor || 'rgba(255,255,255,0.9)'}
            onChange={(c) => onChange({ descriptionBgColor: c })}
            label={t('BG Color', 'BG Color')}
          />
        )}
      </div>
    </div>
  )
}
