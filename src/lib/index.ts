// Bundled styles (Tailwind compiled for the library; also exported as ./style.css)
import './styles.css'

// Components
export { default as DynastyNetwork } from './components/canvas/DynastyNetwork'
export { NodeCard } from './components/canvas/NodeCard'
export { EdgeCard } from './components/editors/EdgeCard'
export { RelationshipTypeDialog } from './components/editors/RelationshipTypeDialog'

// App-level router-free components
export { default as FamilyChartEditor } from './app/FamilyChartEditor'
export type { FamilyChartEditorProps } from './app/FamilyChartEditor'
export { default as FamilyChartList } from './app/FamilyChartList'
export type { FamilyChartListProps } from './app/FamilyChartList'

// Context & hooks
export { DataProvider, useDataContext } from './context/DataContext'

// Types
export type { PageProps, ChartProps, PersonNode, Relationship, NodeShape } from './types/charts'
