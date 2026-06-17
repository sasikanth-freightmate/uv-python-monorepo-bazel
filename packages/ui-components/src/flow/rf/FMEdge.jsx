'use client'
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'
import { Plus } from '../../lib/glyphs.jsx'

// Custom edge. Branch-coloured bezier with the optional midpoint "insert step"
// button (editor only). Read-only canvases pass colour/width/dash overrides via
// data and omit onInsert.
const colorFor = (b) => (b === 'true' ? '#9FD3B6' : b === 'false' ? '#C7CCD6' : '#C9CFD8')

export function FMEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.45,
  })
  const running = data && data.running
  const stroke = (data && data.colorOverride) || (running ? '#7CC9A1' : colorFor(data && data.branch))
  const width = (data && data.widthOverride) || (running ? 2.6 : 2)
  const dash = (data && data.dash) || (running ? '6 6' : undefined)
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke, strokeWidth: width, strokeLinecap: 'round',
          strokeDasharray: dash,
          animation: running ? 'fmdash .5s linear infinite' : undefined,
        }}
      />
      {data && data.onInsert && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan transition-colors hover:!border-[#0E6EFF] hover:!bg-[#0E6EFF] hover:!text-white"
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all', width: 22, height: 22, borderRadius: '50%',
              background: '#fff', color: data.insertActive ? '#0E6EFF' : '#A6ACB6',
              border: '1px solid ' + (data.insertActive ? '#0E6EFF' : '#D7DBE2'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 1px 3px rgba(20,24,32,.12)', zIndex: 4,
            }}
            title="Insert step"
            onClick={(e) => { e.stopPropagation(); data.onInsert(id) }}
          >
            <Plus size={13} />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
