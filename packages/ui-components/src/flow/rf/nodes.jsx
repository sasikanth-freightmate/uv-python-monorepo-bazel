'use client'
import { memo } from 'react'
import { NODE_W } from '../../lib/tokens.js'
import { NodeBody, RunNodeBody, VerNodeBody } from '../NodeBody.jsx'
import { NodeHandles } from './handles.jsx'

// React Flow custom nodes. Each wraps the shared NodeBody visual + the connect
// handles. RF positions the outer wrapper via a transform on .react-flow__node,
// so these set width only and let handles position relative to it.

export const FMNode = memo(function FMNode({ data, selected }) {
  const { node, runState } = data
  return (
    <div style={{ width: NODE_W }} data-testid={'node-' + node.id}>
      <NodeHandles type={node.type} />
      <NodeBody node={node} selected={selected} runState={runState} />
    </div>
  )
})

export const FMRunNode = memo(function FMRunNode({ data }) {
  const { node, decor } = data
  return (
    <div style={{ width: NODE_W }} data-testid={'runnode-' + node.id}>
      <NodeHandles type={node.type} readOnly />
      <RunNodeBody node={node} decor={decor} />
    </div>
  )
})

export const FMVerNode = memo(function FMVerNode({ data }) {
  const { node, decor } = data
  return (
    <div style={{ width: NODE_W }} data-testid={'vernode-' + node.id}>
      <NodeHandles type={node.type} readOnly />
      <VerNodeBody node={node} decor={decor} />
    </div>
  )
})
