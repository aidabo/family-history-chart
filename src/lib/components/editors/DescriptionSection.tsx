'use client'

import { PersonNode } from '@/types/charts'
import { ColorPicker } from '@/components/ui/ColorPicker'

interface Props {
  node: PersonNode
  onChange: (updates: Partial<PersonNode>) => void
}

export function DescriptionSection({ node, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">Description</label>
        <textarea
          defaultValue={node.description ?? ''}
          onBlur={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder="Add a description..."
          className="w-full text-sm border border-gray-300 rounded px-2 py-1 resize-y focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {/* Default position (initial snap, overridden by drag) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">Default Position</label>
          {(node.descriptionOffsetX != null || node.descriptionOffsetY != null) && (
            <button
              type="button"
              onClick={() => onChange({ descriptionOffsetX: undefined, descriptionOffsetY: undefined })}
              className="text-xs text-blue-500 hover:text-blue-700 underline"
            >
              Reset drag
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
        <p className="text-xs text-gray-400 mt-1">Drag description on canvas to reposition</p>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-0.5">
          Width: {node.descriptionWidth ?? 160}px
        </label>
        <input
          type="range" min={80} max={300}
          value={node.descriptionWidth ?? 160}
          onChange={(e) => onChange({ descriptionWidth: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Description background */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Background</label>
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
              {val === 'none' ? 'None' : val.charAt(0).toUpperCase() + val.slice(1)}
            </button>
          ))}
        </div>
        {node.descriptionBgShape && (
          <ColorPicker
            value={node.descriptionBgColor || 'rgba(255,255,255,0.9)'}
            onChange={(c) => onChange({ descriptionBgColor: c })}
            label="BG Color"
          />
        )}
      </div>
    </div>
  )
}
