'use client'

// Shared SVG edge layer. `edges` is a list of { id, d, color, width, dash,
// animated } produced by the orchestrator from node geometry.
export function CanvasEdges({ edges = [], preview }) {
  return (
    <svg
      width="5000"
      height="3200"
      style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
    >
      {edges.map((e) => (
        <path
          key={e.id}
          d={e.d}
          fill="none"
          stroke={e.color}
          strokeWidth={e.width}
          strokeLinecap="round"
          strokeDasharray={e.dash || undefined}
          style={e.animated ? { animation: 'fmdash .5s linear infinite' } : undefined}
        />
      ))}
      {preview && (
        <path d={preview} fill="none" stroke="#0E6EFF" strokeWidth={2.4} strokeLinecap="round" strokeDasharray="5 5" />
      )}
    </svg>
  )
}
