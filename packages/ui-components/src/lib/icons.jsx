// The FM Flow node icon set — hand-ported from the prototype so node glyphs
// stay identical. Each entry is a list of [tag, attrs] children rendered inside
// a stroked 24×24 SVG.

const PATHS = {
  bolt: [['path', { d: 'M13 2 4 14h7l-1 8 10-12h-7z' }]],
  clock: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7.5V12l3 1.8' }]],
  globe: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M3 12h18' }],
    ['path', { d: 'M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18' }],
  ],
  branch: [
    ['circle', { cx: 6, cy: 6, r: 2.4 }],
    ['circle', { cx: 6, cy: 18, r: 2.4 }],
    ['circle', { cx: 18, cy: 9, r: 2.4 }],
    ['path', { d: 'M6 8.4v7.2' }],
    ['path', { d: 'M18 11.4c0 3.2-3 4.6-6 4.6' }],
  ],
  filter: [['path', { d: 'M3 4.5h18l-7 8.5v6l-4 2v-8z' }]],
  search: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'M21 21l-4.3-4.3' }]],
  truck: [
    ['rect', { x: 2.5, y: 6.5, width: 11, height: 8.5, rx: 1 }],
    ['path', { d: 'M13.5 9h4l3 3v3h-7z' }],
    ['circle', { cx: 7, cy: 17.5, r: 1.7 }],
    ['circle', { cx: 17, cy: 17.5, r: 1.7 }],
  ],
  db: [
    ['ellipse', { cx: 12, cy: 6, rx: 7.5, ry: 3 }],
    ['path', { d: 'M4.5 6v12c0 1.6 3.4 3 7.5 3s7.5-1.4 7.5-3V6' }],
    ['path', { d: 'M4.5 12c0 1.6 3.4 3 7.5 3s7.5-1.4 7.5-3' }],
  ],
  bell: [
    ['path', { d: 'M6 9a6 6 0 0 1 12 0c0 5.5 1.8 7 1.8 7H4.2S6 14.5 6 9' }],
    ['path', { d: 'M10.2 20a2 2 0 0 0 3.6 0' }],
  ],
  mail: [['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }], ['path', { d: 'M3.5 7l8.5 6 8.5-6' }]],
}

/** Node-type glyph. `kind` indexes PATHS; falls back to the bolt icon. */
export function Icon({ kind, color = 'currentColor', size = 18, strokeWidth = 1.9, className, style }) {
  const children = PATHS[kind] || PATHS.bolt
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {children.map(([Tag, attrs], i) => (
        <Tag key={i} {...attrs} />
      ))}
    </svg>
  )
}
