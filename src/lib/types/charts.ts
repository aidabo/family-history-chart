export type NodeShape =
  | 'circle' | 'rect' | 'diamond' | 'hexagon' | 'band' | 'ellipse'
  | 'star' | 'shield' | 'bubble' | 'tag' | 'seal'
  // decorative Japanese/historical shapes (see shapeArt.ts)
  | 'kabuto' | 'thinker' | 'manga' | 'flyer' | 'scroll'
  | 'castle' | 'crest' | 'enso' | 'compass' | 'book'
  // portrait frames for people (circular photo + themed frame)
  | 'pGeneral' | 'pNoble' | 'pRoyal' | 'pScholar' | 'pMonk' | 'pHero'

export type RelationType =
  | 'parent-child' | 'marriage' | 'remarriage' | 'partner' | 'sibling'
  | 'succession' | 'ally' | 'rival' | 'mentor' | 'enemy' | 'friend' | 'custom'
  | 'master' | 'disciple' | 'comrade'

export type EpisodeType = 'event' | 'article' | 'episode' | 'note'

// Per-field text style override. Any unset field falls back to the node-level
// defaults (labelColor / labelFontSize / fontFamily / labelBold) set via the dialog.
export interface TextStyle {
  color?: string
  fontSize?: number
  fontFamily?: string
  bold?: boolean
}

// Vertical writing (縦書き) for CJK aesthetics.
// Chart-level: 'off' (horizontal), 'cjk' (auto — vertical only for Japanese/Chinese text), 'on' (all vertical).
export type VerticalTextMode = 'off' | 'cjk' | 'on'

export interface Episode {
  id: string
  personId: string
  title: string
  excerpt?: string
  url?: string
  date?: string
  type?: EpisodeType
}

export interface PersonNode {
  id: string
  type?: 'person' | 'union'
  name: string
  title?: string
  gender?: 'male' | 'female' | 'other'
  birth?: string
  death?: string
  age?: string
  image?: string
  profileUrl?: string
  description?: string
  descriptionPosition?: 'below' | 'right'
  descriptionWidth?: number
  // Position (D3 force simulation)
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
  // Appearance
  shape?: NodeShape
  nodeSize?: number        // radius for circle/diamond/hexagon, half-height for rect
  bgColor?: string
  borderColor?: string
  labelColor?: string
  labelFontSize?: number
  labelBold?: boolean        // name font weight (default bold)
  // Per-field style overrides (fall back to the node-level defaults above).
  nameStyle?: TextStyle
  titleStyle?: TextStyle
  descriptionStyle?: TextStyle
  labelRotation?: number     // rotate the name label box (degrees)
  labelScaleX?: number       // affine transform of the name box (negative = flip H)
  labelScaleY?: number       // negative = flip V
  labelSkewX?: number        // skew (degrees)
  vertical?: 'on' | 'off'    // per-node vertical-writing override (undefined = inherit chart mode)
  fontFamily?: string
  // Label display
  labelPosition?: 'above' | 'below' | 'left' | 'right' | 'inside'
  labelOffsetX?: number      // free drag offset from node center (overrides labelPosition when set)
  labelOffsetY?: number
  labelBgColor?: string
  labelBgShape?: 'rect' | 'pill'
  periodOffsetX?: number     // free drag offset for the lifespan (period) label, independent of title
  periodOffsetY?: number
  // Description display
  descriptionOffsetX?: number   // free drag offset from node center
  descriptionOffsetY?: number
  descriptionHeight?: number     // box height (vertical writing: user-controlled, columns wrap at this height)
  descriptionBgColor?: string
  descriptionBgShape?: 'rect' | 'pill'
  descriptionBorder?: boolean   // show a frame/border around the description box
  descriptionAlign?: 'left' | 'center' | 'right'  // text alignment (default center)
  descriptionRotation?: number   // rotate the description box (degrees)
  descriptionScaleX?: number     // affine transform of the description box (negative = flip H)
  descriptionScaleY?: number     // negative = flip V
  descriptionSkewX?: number      // skew (degrees)
  // Band-specific (dynasty era)
  bandWidth?: number
  bandHeight?: number
  bandStart?: string
  bandEnd?: string
  // Union node relationship info (holds the REAL relationship the union represents)
  marriage?: {
    start?: string
    end?: string
    label?: string
    type?: RelationType
  }
}

export interface Relationship {
  id: string
  source: string
  target: string
  type: RelationType
  label?: string
  color?: string
  width?: number
  start?: string
  end?: string
}

export interface ChartViewport {
  k: number   // zoom scale
  x: number   // pan translate x
  y: number   // pan translate y
}

export interface ChartProps {
  dynasties: any[]
  persons: PersonNode[]
  relationships: Relationship[]
  episodes: Episode[]
  events: any[]
  // Persisted page-level view state (restored on next load) + canvas background.
  viewport?: ChartViewport
  background?: string        // CSS color for the canvas background
  backgroundImage?: string   // image URL / data-URI layered over the background color
  backgroundOpacity?: number // 0..1 opacity applied to the color+image layer (default 1)
  verticalText?: VerticalTextMode  // chart-wide vertical writing mode (default 'off')
  dpi?: number               // thumbnail/print DPI override for this page
}

export interface PageProps {
  id: string
  title: string
  description?: string
  image?: string
  status?: 'published' | 'draft'
  category?: string
  thumbnail?: string
  created_at?: Date
  options?: any
  chartProps: ChartProps
}
