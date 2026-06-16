// @fm-flow/ui-components — shadcn + Tailwind presentational components for the
// FM Flow workflow builder. State lives in the consuming app; these render
// plain-data view-models.

// foundation
export { cn } from './lib/utils.js'
export * from './lib/tokens.js'
export { Icon } from './lib/icons.jsx'
export * as Glyph from './lib/glyphs.jsx'

// shadcn primitives
export { Button, buttonVariants } from './ui/button.jsx'
export { Badge } from './ui/badge.jsx'
export { Input, SearchInput } from './ui/input.jsx'
export { Select } from './ui/select.jsx'
export { Textarea } from './ui/textarea.jsx'
export { Card, IconChip } from './ui/card.jsx'

// canvas vocabulary + shell
export { NodeCard } from './flow/NodeCard.jsx'
export { CanvasEdges } from './flow/CanvasEdges.jsx'
export { AppRail } from './flow/AppRail.jsx'
export { WorkflowTopBar } from './flow/WorkflowTopBar.jsx'
export { PageTopBar } from './flow/PageTopBar.jsx'
export { Toast } from './flow/Toast.jsx'

// panels
export { ConfigPanel } from './flow/ConfigPanel.jsx'
export { PaletteSidebar } from './flow/PaletteSidebar.jsx'
export { RunInspector } from './flow/RunInspector.jsx'
export { TokenField } from './flow/TokenField.jsx'

// screens
export { DashboardScreen } from './flow/screens/DashboardScreen.jsx'
export { EditorScreen } from './flow/screens/EditorScreen.jsx'
export { RunDetailScreen } from './flow/screens/RunDetailScreen.jsx'
export { HistoryScreen } from './flow/screens/HistoryScreen.jsx'
export { ConnectionsScreen } from './flow/screens/ConnectionsScreen.jsx'
export { TemplatesScreen } from './flow/screens/TemplatesScreen.jsx'
export { VersionsScreen } from './flow/screens/VersionsScreen.jsx'
