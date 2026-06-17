import dagre from '@dagrejs/dagre'
import { NODE_W } from '../../lib/tokens.js'

// Left-to-right auto-layout for the workflow graph. Pure: takes domain nodes +
// edges, returns domain nodes with fresh x/y. Node heights match
// FlowApp.nodeHeight (condition 120, else 90).
const H = (n) => (n.type === 'condition' ? 120 : 90)

export function layoutLR(nodes, edges, opts = {}) {
  const { rankdir = 'LR', ranksep = 80, nodesep = 36 } = opts
  if (!nodes.length) return nodes
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir, ranksep, nodesep, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: H(n) }))
  edges.forEach((e) => { if (e.from && e.to) g.setEdge(e.from, e.to) })
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    if (!p) return n
    return { ...n, x: Math.round(p.x - NODE_W / 2), y: Math.round(p.y - H(n) / 2) }
  })
}
