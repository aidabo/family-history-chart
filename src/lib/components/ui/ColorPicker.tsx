import { useState } from 'react'

const PRESETS = [
  '#3b82f6', '#ec4899', '#10b981', '#f97316', '#8b5cf6',
  '#ef4444', '#f59e0b', '#06b6d4', '#84cc16', '#6366f1',
  '#ffffff', '#1e293b',
]

interface ColorPickerProps {
  value?: string
  onChange: (color: string) => void
  label?: string
}

export function ColorPicker({ value = '#3b82f6', onChange, label }: ColorPickerProps) {
  const [custom, setCustom] = useState(value)

  const handleCustom = (v: string) => {
    setCustom(v)
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
  }

  return (
    <div className="space-y-1">
      {label && <label className="text-xs text-gray-500">{label}</label>}
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => { onChange(c); setCustom(c) }}
            className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
              value === c ? 'border-gray-800 scale-110' : 'border-gray-300'
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <div className="w-5 h-5 rounded border" style={{ backgroundColor: custom }} />
        <input
          type="text"
          value={custom}
          onChange={(e) => handleCustom(e.target.value)}
          placeholder="#rrggbb"
          className="flex-1 text-xs border border-gray-300 rounded px-1 py-0.5 font-mono"
          maxLength={7}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => { onChange(e.target.value); setCustom(e.target.value) }}
          className="w-6 h-6 cursor-pointer rounded border-0 p-0"
          title="Open color picker"
        />
      </div>
    </div>
  )
}
