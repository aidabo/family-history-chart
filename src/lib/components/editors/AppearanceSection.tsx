'use client'

import { useState } from 'react'
import { PersonNode } from '@/types/charts'
import { ShapePicker } from '@/components/ui/ShapePicker'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { FontSelector } from '@/components/ui/FontSelector'
import { useDataContext } from '@/context/DataContext'

interface Props {
  node: PersonNode
  onChange: (updates: Partial<PersonNode>) => void
}

const SHAPE_LABEL: Record<string, string> = {
  circle: '● Circle', rect: '▬ Rect', diamond: '◆ Diamond', hexagon: '⬡ Hexagon',
  band: '━ Band', ellipse: '⬭ Ellipse', star: '★ Star', shield: '🛡 Shield',
  bubble: '💬 Bubble', tag: '🏷 Tag', seal: '🔴 Seal',
  kabuto: '⛩ 武将', thinker: '🗿 思想家', manga: '💥 漫画風', flyer: '📰 チラシ風',
  scroll: '📜 巻物', castle: '🏯 城', crest: '🎴 家紋', enso: '⭕ 禅円',
  compass: '🧭 羅針盤', book: '📚 和本',
  pGeneral: '👤 武将フレーム', pNoble: '🌸 姫フレーム', pRoyal: '👑 皇族フレーム',
  pScholar: '📖 学者フレーム', pMonk: '☯ 僧フレーム', pHero: '⭐ 英雄フレーム',
}

export function AppearanceSection({ node, onChange }: Props) {
  const { t } = useDataContext()
  const isBand = node.shape === 'band'
  const [shapeOpen, setShapeOpen] = useState(false)

  return (
    <div className="space-y-3">
      {/* Collapsible Shape section (many options) */}
      <div className="border border-gray-200 rounded">
        <button
          type="button"
          onClick={() => setShapeOpen((o) => !o)}
          className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <span>{t('Shape', 'Shape')}: <span className="text-gray-800">{SHAPE_LABEL[node.shape ?? 'circle'] ?? node.shape}</span></span>
          <span className="text-gray-400">{shapeOpen ? '▲' : '▼'}</span>
        </button>
        {shapeOpen && (
          <div className="px-2 pb-2">
            <ShapePicker value={node.shape} onChange={(shape) => onChange({ shape })} />
          </div>
        )}
      </div>

      {isBand ? (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">
              {t('Band Width', 'Band Width')}: {node.bandWidth ?? 200}px
            </label>
            <input
              type="range" min={50} max={400}
              value={node.bandWidth ?? 200}
              onChange={(e) => onChange({ bandWidth: Number(e.target.value) })}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">
              {t('Band Height', 'Band Height')}: {node.bandHeight ?? 40}px
            </label>
            <input
              type="range" min={20} max={80}
              value={node.bandHeight ?? 40}
              onChange={(e) => onChange({ bandHeight: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </>
      ) : (
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">
            {t('Node Size', 'Node Size')}: {node.nodeSize ?? 30}px
          </label>
          <input
            type="range" min={10} max={160}
            value={node.nodeSize ?? 30}
            onChange={(e) => onChange({ nodeSize: Number(e.target.value) })}
            className="w-full"
          />
        </div>
      )}

      <ColorPicker value={node.bgColor} onChange={(bgColor) => onChange({ bgColor })} label={t('Background Color', 'Background Color')} />
      <ColorPicker value={node.borderColor} onChange={(borderColor) => onChange({ borderColor })} label={t('Border Color', 'Border Color')} />
      <ColorPicker value={node.labelColor} onChange={(labelColor) => onChange({ labelColor })} label={t('Label Color', 'Label Color')} />
      <FontSelector value={node.fontFamily} onChange={(fontFamily) => onChange({ fontFamily })} label={t('Font Family', 'Font Family')} />

      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-xs text-gray-500">
            {t('Label Size', 'Label Size')}: {node.labelFontSize ?? 12}px
          </label>
          <button
            type="button"
            onClick={() => onChange({ labelBold: node.labelBold === false ? true : false })}
            className={`text-xs px-2 py-0.5 rounded border font-bold transition-colors ${
              node.labelBold === false
                ? 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                : 'bg-blue-500 text-white border-blue-500'
            }`}
            title={t('Bold label title', '名前を太字にする')}
          >
            {t('Bold button', 'B 太字')}
          </button>
        </div>
        <input
          type="range" min={8} max={48}
          value={node.labelFontSize ?? 12}
          onChange={(e) => onChange({ labelFontSize: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Vertical writing (縦書き) override */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">{t('Vertical writing', '縦書き（縦書き）')}</label>
        <div className="grid grid-cols-3 gap-1">
          {([
            [undefined, t('Inherit', '継承')],
            ['on',      t('Vertical', '縦')],
            ['off',     t('Horizontal', '横')],
          ] as [('on' | 'off' | undefined), string][]).map(([val, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => onChange({ vertical: val })}
              className={`text-xs py-1 rounded border transition-colors ${
                node.vertical === val
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">{t('Inherit chart setting hint', '継承＝チャートの設定に従う')}</p>
      </div>

      {/* Label position picker */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">{t('Label Position', 'Label Position')}</label>
          {(node.labelOffsetX != null || node.labelOffsetY != null) && (
            <button
              type="button"
              onClick={() => onChange({ labelOffsetX: undefined, labelOffsetY: undefined })}
              className="text-xs text-blue-500 hover:text-blue-700 underline"
            >
              {t('Reset drag', 'Reset drag')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-5 gap-1">
          {(['above', 'below', 'left', 'right', 'inside'] as const).map((val) => {
            const icons: Record<string, string> = { above: '↑', below: '↓', left: '←', right: '→', inside: '⊡' }
            const tips: Record<string, string>  = { above: 'Above', below: 'Below', left: 'Left', right: 'Right', inside: 'Inside' }
            return (
              <button
                key={val}
                type="button"
                title={tips[val]}
                onClick={() => onChange({ labelPosition: val, labelOffsetX: undefined, labelOffsetY: undefined })}
                className={`text-base py-1 rounded border transition-colors ${
                  (node.labelPosition || 'above') === val
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {icons[val]}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 mt-1">{t('Label drag hint', 'Drag label on canvas to reposition freely')}</p>
      </div>

      {/* Label background */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">{t('Label Background', 'Label Background')}</label>
        <div className="flex gap-1 mb-1.5">
          {(['none', 'rect', 'pill'] as const).map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => onChange({
                labelBgShape: val === 'none' ? undefined : val,
                labelBgColor: val === 'none' ? undefined : (node.labelBgColor || 'rgba(255,255,255,0.9)'),
              })}
              className={`flex-1 text-xs py-1 rounded border transition-colors ${
                (val === 'none' ? !node.labelBgShape : node.labelBgShape === val)
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {val === 'none' ? t('None', 'None') : val === 'rect' ? t('Rect', 'Rect') : t('Pill', 'Pill')}
            </button>
          ))}
        </div>
        {node.labelBgShape && (
          <ColorPicker
            value={node.labelBgColor || 'rgba(255,255,255,0.9)'}
            onChange={(c) => onChange({ labelBgColor: c })}
            label={t('BG Color', 'BG Color')}
          />
        )}
      </div>
    </div>
  )
}
