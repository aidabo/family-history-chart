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

export type EpisodeType = 'event' | 'article' | 'episode' | 'note'

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
  fontFamily?: string
  // Label display
  labelPosition?: 'above' | 'below' | 'left' | 'right' | 'inside'
  labelOffsetX?: number      // free drag offset from node center (overrides labelPosition when set)
  labelOffsetY?: number
  labelBgColor?: string
  labelBgShape?: 'rect' | 'pill'
  // Description display
  descriptionOffsetX?: number   // free drag offset from node center
  descriptionOffsetY?: number
  descriptionBgColor?: string
  descriptionBgShape?: 'rect' | 'pill'
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

export interface ChartProps {
  dynasties: any[]
  persons: PersonNode[]
  relationships: Relationship[]
  episodes: Episode[]
  events: any[]
}

export interface PageProps {
  id: string
  title: string
  description?: string
  image?: string
  created_at?: Date
  options?: any
  chartProps: ChartProps
}
