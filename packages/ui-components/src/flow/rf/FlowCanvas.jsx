'use client'
// React Flow's stylesheet is imported once by the host app's root layout
// (apps/flow-ui/src/app/layout.jsx) — Next resolves node_modules CSS from the
// app, not from this transpiled package.
import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  useReactFlow, useNodesState, useEdgesState,
} from '@xyflow/react'
import { FMNode, FMRunNode, FMVerNode } from './nodes.jsx'
import { FMEdge } from './FMEdge.jsx'

// Stable identities so RF doesn't warn / re-create on every render.
const NODE_TYPES = { fmNode: FMNode, fmRunNode: FMRunNode, fmVerNode: FMVerNode }
const EDGE_TYPES = { fmEdge: FMEdge }

// React Flow canvas. FlowApp owns the domain graph and passes mapped nodes/edges
// + handlers via `vm`. We keep React Flow's own node/edge state locally (the
// canonical pattern for external stores) and re-seed it only when the domain
// graph reference changes — FlowApp memoizes those arrays, so transient
// re-renders (toast, zoom, selection elsewhere) don't churn the canvas.
// `vm.readOnly` makes a pannable, non-editable canvas for run/versions.
export function FlowCanvas({ vm }) {
  return (
    <ReactFlowProvider>
      <Inner vm={vm} />
    </ReactFlowProvider>
  )
}

function Inner({ vm }) {
  const nodeTypes = useMemo(() => NODE_TYPES, [])
  const edgeTypes = useMemo(() => EDGE_TYPES, [])
  const ro = !!vm.readOnly

  const [nodes, setNodes, onNodesChangeLocal] = useNodesState(vm.nodes)
  const [edges, setEdges, onEdgesChangeLocal] = useEdgesState(vm.edges)

  // Re-seed when the domain graph changes. Preserve RF-measured dimensions so a
  // re-seed never triggers a re-measure → re-fit loop. Position comes from the
  // domain (the source of truth); measured size stays from the live canvas.
  useEffect(() => {
    setNodes((cur) => {
      const prev = new Map(cur.map((n) => [n.id, n]))
      return vm.nodes.map((n) => {
        const p = prev.get(n.id)
        return p ? { ...n, measured: p.measured, width: p.width, height: p.height } : n
      })
    })
  }, [vm.nodes, setNodes])
  useEffect(() => { setEdges(vm.edges) }, [vm.edges, setEdges])

  const handleNodesChange = useCallback((changes) => {
    onNodesChangeLocal(changes)
    if (vm.onNodesChange) vm.onNodesChange(changes)
  }, [onNodesChangeLocal, vm])
  const handleEdgesChange = useCallback((changes) => {
    onEdgesChangeLocal(changes)
    if (vm.onEdgesChange) vm.onEdgesChange(changes)
  }, [onEdgesChangeLocal, vm])

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={vm.onInit}
        onMove={vm.onMove}
        onNodeClick={vm.onNodeClick}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={vm.onConnect}
        onNodeDragStart={vm.onNodeDragStart}
        onNodeDragStop={vm.onNodeDragStop}
        onNodesDelete={vm.onNodesDelete}
        onSelectionChange={vm.onSelectionChange}
        onPaneClick={vm.onPaneClick}
        onDrop={vm.onDrop}
        onDragOver={vm.onDragOver}
        nodesDraggable={!ro}
        nodesConnectable={!ro}
        elementsSelectable={!ro}
        nodesFocusable={!ro}
        edgesFocusable={false}
        minZoom={0.2}
        maxZoom={1.5}
        fitView
        fitViewOptions={FIT_OPTS}
        deleteKeyCode={ro ? null : DELETE_KEYS}
        multiSelectionKeyCode={MULTI_KEYS}
        selectionKeyCode={ro ? null : 'Shift'}
        proOptions={PRO_OPTS}
        defaultEdgeOptions={DEFAULT_EDGE}
        panOnDrag
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#C7CCD4" />
        {vm.fitKey != null && <FitOnKey fitKey={vm.fitKey} />}
        {vm.children}
      </ReactFlow>
    </div>
  )
}

// Stable prop object/array identities (avoid re-syncing RF every render).
const FIT_OPTS = { padding: 0.2 }
const DELETE_KEYS = ['Delete', 'Backspace']
const MULTI_KEYS = ['Meta', 'Control']
const PRO_OPTS = { hideAttribution: true }
const DEFAULT_EDGE = { type: 'fmEdge' }

// Re-fit the read-only canvases when their displayed graph changes (run switch,
// version/compare switch). fitView measures nodes, so defer a frame.
function FitOnKey({ fitKey }) {
  const rf = useReactFlow()
  useEffect(() => {
    const id = setTimeout(() => rf.fitView({ padding: 0.2, duration: 200 }), 30)
    return () => clearTimeout(id)
  }, [fitKey, rf])
  return null
}
