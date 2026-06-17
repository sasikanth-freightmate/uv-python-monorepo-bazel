'use client'
import { Handle, Position } from '@xyflow/react'

// Connect handles for the React Flow nodes. Geometry mirrors the bespoke ports
// in tokens.js exactly: a 13px dot whose CENTER sits at the node-local y of the
// matching outPort/inPort (input & normal output at y=33; condition true at 76,
// false at 106). We position with explicit left/right + top and disable RF's
// default centering transform so the math is deterministic.
const HALF = 6.5

function dot(color, top, side, readOnly) {
  return {
    width: 13, height: 13, minWidth: 0, minHeight: 0, borderRadius: '50%',
    background: '#fff', border: '2px solid ' + color, transform: 'none',
    top: top - HALF, [side]: -7,
    opacity: readOnly ? 0 : 1, cursor: readOnly ? 'default' : 'crosshair',
  }
}

const hasInput = (t) => t !== 'trigger' && t !== 'schedule' && t !== 'http_in'

export function NodeHandles({ type, readOnly }) {
  const isCond = type === 'condition'
  const conn = !readOnly
  return (
    <>
      {hasInput(type) && (
        <Handle id="in" type="target" position={Position.Left} isConnectable={conn}
          style={dot('#C4CAD3', 33, 'left', readOnly)} />
      )}
      {isCond ? (
        <>
          <Handle id="true" type="source" position={Position.Right} isConnectable={conn}
            style={dot('#74C49A', 76, 'right', readOnly)} />
          <Handle id="false" type="source" position={Position.Right} isConnectable={conn}
            style={dot('#C9CDD6', 106, 'right', readOnly)} />
        </>
      ) : (
        <Handle id="out" type="source" position={Position.Right} isConnectable={conn}
          style={dot('#C4CAD3', 33, 'right', readOnly)} />
      )}
    </>
  )
}
