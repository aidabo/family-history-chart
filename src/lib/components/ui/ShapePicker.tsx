import { NodeShape } from '@/types/charts'

// ┌─ ADDING A NODE SHAPE — conventions (so the node stays readable) ─────────────────┐
// │ A node draws its NAME centred INSIDE the shape, with TITLE(肩書)/PERIOD(生没年)   │
// │ around it and DESCRIPTION(メモ) beside it. For every shape:                       │
// │  1. TEXT-SAFE: the shape behind the name must be transparent/light enough to read │
// │     the centred name. Compose shapes from a BORDER + simple FILL/LINES only.      │
// │     Do NOT add opaque emoji-art or photo/portrait frames — those were removed      │
// │     from this picker because they hid the name (their types/rendering remain in    │
// │     shapeArt.ts only for backward compatibility with old charts).                 │
// │  2. SIZE-DRIVEN: honour `nodeSize` (round shapes) or bandWidth/bandHeight so the   │
// │     shape scales; the label layout in DynastyNetwork measures its offsets from the │
// │     shape extent + a small gap, so labels track the size automatically.            │
// │  3. LABEL LAYOUT lives in DynastyNetwork's "NODE LABEL LAYOUT CONVENTION" block    │
// │     (name inside / title above|right / period stacked|outer / description          │
// │     below|left, horizontal|vertical). New round shapes get it for free via         │
// │     drawCenteredName + lblOffMap; non-round shapes (like rect/band) need their own  │
// │     branch in labelSel that mirrors those rules for both writing directions.       │
// │ Register the shape in SHAPES below AND in NodeShape (types/charts.ts).             │
// └───────────────────────────────────────────────────────────────────────────────────┘

interface ShapePickerProps {
  value?: NodeShape
  onChange: (shape: NodeShape) => void
  label?: string
}

const SHAPES: { shape: NodeShape; icon: string; title: string }[] = [
  { shape: 'circle',  icon: '●',  title: 'Circle (avatar)' },
  { shape: 'rect',    icon: '▭',  title: 'Rectangle (card)' },
  { shape: 'diamond', icon: '◆',  title: 'Diamond' },
  { shape: 'hexagon', icon: '⬡',  title: 'Hexagon' },
  { shape: 'band',    icon: '▬',  title: 'Band (dynasty era)' },
  { shape: 'ellipse', icon: '⬭',  title: 'Ellipse (free)' },
  { shape: 'star',    icon: '★',  title: 'Star (hero / 英雄)' },
  { shape: 'shield',  icon: '🛡', title: 'Shield / 盾' },
  // NOTE: the decorative emoji-art shapes (bubble/tag/seal/kabuto/thinker/manga/flyer/
  // scroll/castle/crest/enso/compass/book) and ALL portrait frames (pGeneral/pNoble/pRoyal/
  // pScholar/pMonk/pHero) were removed from the picker — their art is opaque and hides/obscures
  // the node text. The types + rendering remain for backward compatibility with existing charts.
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
