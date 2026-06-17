import { NODE_W } from '../../lib/tokens.js'

// Domain <-> React Flow shape mapping. Domain stays the source of truth in
// FlowApp; these translate at the canvas boundary only.
//
// domain node: { id, slug, type, title, sub, x, y, configured, config }
// domain edge: { id, from, to, branch? }   (branch = 'true' | 'false')

export { NODE_W }

// extra: { runState, decor, type }
// NOTE: we intentionally do NOT set `selected` here. React Flow owns selection
// internally and passes `selected` to the custom node; driving it from app state
// while also handling onSelectionChange creates an infinite render loop.
export function toRFNode(n, extra = {}) {
  return {
    id: n.id,
    type: extra.type || 'fmNode',
    position: { x: n.x, y: n.y },
    data: { node: n, runState: extra.runState || null, decor: extra.decor || null },
  }
}

// extra: { running, onInsert, insertActive, colorOverride, widthOverride, dash, type }
export function toRFEdge(ed, extra = {}) {
  return {
    id: ed.id,
    source: ed.from,
    target: ed.to,
    sourceHandle: ed.branch ? ed.branch : 'out',
    targetHandle: 'in',
    type: extra.type || 'fmEdge',
    data: {
      branch: ed.branch || null,
      running: !!extra.running,
      onInsert: extra.onInsert || null,
      insertActive: !!extra.insertActive,
      colorOverride: extra.colorOverride || null,
      widthOverride: extra.widthOverride || null,
      dash: extra.dash || null,
    },
  }
}

// React Flow Connection -> partial domain edge (caller assigns the id).
export function fromRFConnection(c) {
  const branch = c.sourceHandle && c.sourceHandle !== 'out' ? c.sourceHandle : undefined
  return { from: c.source, to: c.target, branch }
}
