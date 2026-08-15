interface FontSelectorProps {
  value?: string
  onChange: (font: string) => void
  label?: string
}

const FONTS = [
  { label: 'System default',     value: 'system-ui, sans-serif' },
  { label: 'Sans-serif',         value: 'Arial, Helvetica, sans-serif' },
  { label: 'Serif',              value: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace',          value: '"Courier New", Courier, monospace' },
  { label: 'Rounded',            value: '"Nunito", "Comic Sans MS", cursive' },
  { label: 'Elegant',            value: '"Palatino Linotype", Palatino, serif' },
  // Japanese
  { label: 'Noto Serif JP 明朝',  value: '"Noto Serif JP", serif' },
  { label: 'Noto Sans JP ゴシック', value: '"Noto Sans JP", sans-serif' },
  { label: 'Sawarabi Mincho 明朝', value: '"Sawarabi Mincho", serif' },
  { label: 'Zen Antique 古風',    value: '"Zen Antique", serif' },
  { label: 'DotGothic16 ドット',  value: '"DotGothic16", sans-serif' },
  { label: 'Yomogi よもぎ',       value: '"Yomogi", cursive' },
  // Chinese (Simplified & Traditional)
  { label: 'Noto Serif SC 宋体',  value: '"Noto Serif SC", serif' },
  { label: 'Ma Shan Zheng 毛筆楷', value: '"Ma Shan Zheng", cursive' },
  { label: 'ZCOOL XiaoWei 小魏体', value: '"ZCOOL XiaoWei", serif' },
  { label: 'ZCOOL QingKe 青柯黄油', value: '"ZCOOL QingKe HuangYou", cursive' },
  { label: 'Long Cang 龙藏',      value: '"Long Cang", cursive' },
  { label: 'Zhi Mang Xing 执芒星', value: '"Zhi Mang Xing", cursive' },
]

export function FontSelector({ value, onChange, label }: FontSelectorProps) {
  return (
    <div className="space-y-1">
      {label && <label className="text-xs text-gray-500">{label}</label>}
      <select
        value={value ?? FONTS[0].value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs border border-gray-300 rounded px-2 py-1"
        style={{ fontFamily: value }}
      >
        {FONTS.map((f) => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  )
}
