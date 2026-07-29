import { NodeShape } from '@/types/charts'

interface ShapePickerProps {
  value?: NodeShape
  onChange: (shape: NodeShape) => void
  label?: string
}

const SHAPES: { shape: NodeShape; icon: string; title: string }[] = [
  { shape: 'circle',  icon: '●',  title: 'Circle (avatar)' },
  { shape: 'rect',    icon: '▬',  title: 'Rectangle (card)' },
  { shape: 'diamond', icon: '◆',  title: 'Diamond' },
  { shape: 'hexagon', icon: '⬡',  title: 'Hexagon' },
  { shape: 'band',    icon: '━',  title: 'Band (dynasty era)' },
  { shape: 'ellipse', icon: '⬭',  title: 'Ellipse (free)' },
  { shape: 'star',    icon: '★',  title: 'Star (hero / 英雄)' },
  { shape: 'shield',  icon: '🛡', title: 'Shield / 盾' },
  { shape: 'bubble',  icon: '💬', title: 'Speech bubble / 吹き出し' },
  { shape: 'tag',     icon: '🏷', title: 'Tag / ラベル' },
  { shape: 'seal',    icon: '🔴', title: 'Seal / 印' },
  // decorative Japanese/historical cards
  { shape: 'kabuto',  icon: '⛩',  title: '武将 Busho (kabuto)' },
  { shape: 'thinker', icon: '🗿', title: '思想家 Philosopher' },
  { shape: 'manga',   icon: '💥', title: '漫画風 Manga' },
  { shape: 'flyer',   icon: '📰', title: 'チラシ風 Retro flyer' },
  { shape: 'scroll',  icon: '📜', title: '巻物 Scroll' },
  { shape: 'castle',  icon: '🏯', title: '城 Castle' },
  { shape: 'crest',   icon: '🎴', title: '家紋 Family crest' },
  { shape: 'enso',    icon: '⭕', title: '禅円 Ensō' },
  { shape: 'compass', icon: '🧭', title: '羅針盤 Compass' },
  { shape: 'book',    icon: '📚', title: '和本 Japanese book' },
  // portrait frames for people (photo + themed frame)
  { shape: 'pGeneral', icon: '👤', title: '武将 肖像フレーム (General)' },
  { shape: 'pNoble',   icon: '🌸', title: '姫 肖像フレーム (Noble)' },
  { shape: 'pRoyal',   icon: '👑', title: '皇族 肖像フレーム (Royal)' },
  { shape: 'pScholar', icon: '📖', title: '学者 肖像フレーム (Scholar)' },
  { shape: 'pMonk',    icon: '☯', title: '僧 肖像フレーム (Monk)' },
  { shape: 'pHero',    icon: '⭐', title: '英雄 肖像フレーム (Hero)' },
]

export function ShapePicker({ value = 'circle', onChange, label }: ShapePickerProps) {
  return (
    <div className="space-y-1">
      {label && <label className="text-xs text-gray-500">{label}</label>}
      <div className="grid grid-cols-6 gap-1">
        {SHAPES.map(({ shape, icon, title }) => (
          <button
            key={shape}
            onClick={() => onChange(shape)}
            title={title}
            className={`py-1 rounded text-base transition-colors ${
              value === shape
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {icon}
          </button>
        ))}
      </div>
    </div>
  )
}
