// Small stroked UI glyphs used throughout the app chrome (top bars, buttons,
// list rows). Kept separate from the node Icon set. Each accepts size / color
// via props and defaults to currentColor so they inherit button text colour.

function Svg({ size = 16, sw = 2, fill = 'none', children, className, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === 'none' ? 'currentColor' : 'none'}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {children}
    </svg>
  )
}

export const Plus = (p) => <Svg sw={2.4} {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const Minus = (p) => <Svg sw={2.2} {...p}><path d="M5 12h14" /></Svg>
export const ChevronRight = (p) => <Svg {...p}><path d="M9 18l6-6-6-6" /></Svg>
export const ChevronDown = (p) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>
export const ArrowRight = (p) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
export const Search = (p) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Svg>
export const X = (p) => <Svg sw={2.2} {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
export const Check = (p) => <Svg sw={2.4} {...p}><path d="M20 6 9 17l-5-5" /></Svg>
export const Bolt = (p) => <Svg {...p}><path d="M13 2 4 14h7l-1 8 10-12h-7z" /></Svg>
export const Save = (p) => (
  <Svg {...p}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
  </Svg>
)
export const Restore = (p) => <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" /></Svg>
export const Play = (p) => <Svg fill="currentColor" sw={0} {...p}><path d="M7 4.5v15l13-7.5z" /></Svg>
export const Pause = (p) => (
  <Svg fill="currentColor" sw={0} {...p}>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </Svg>
)
export const Stop = (p) => <Svg fill="currentColor" sw={0} {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>
export const Trash = (p) => (
  <Svg {...p}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </Svg>
)
export const Copy = (p) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </Svg>
)
export const Lock = (p) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
)
export const Alert = (p) => (
  <Svg {...p}>
    <path d="M10.3 4 2 18a1.5 1.5 0 0 0 1.3 2.2h17.4A1.5 1.5 0 0 0 22 18L13.7 4a1.5 1.5 0 0 0-2.6 0z" />
    <path d="M12 9v4M12 17h0" />
  </Svg>
)
export const Versions = (p) => (
  <Svg sw={1.9} {...p}>
    <path d="M12 3v6" />
    <circle cx="12" cy="5" r="2" />
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="19" r="2" />
    <path d="M12 9a7 7 0 0 1-6 7M12 9a7 7 0 0 0 6 7" />
  </Svg>
)
export const Spinner = (p) => (
  <Svg sw={2.4} style={{ animation: 'fmspin .8s linear infinite' }} {...p}>
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
  </Svg>
)
export const Fit = (p) => (
  <Svg {...p}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3" />
  </Svg>
)
export const Grid = (p) => (
  <Svg sw={1.9} {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
  </Svg>
)
export const Flow = (p) => (
  <Svg sw={1.9} {...p}>
    <circle cx="6" cy="6" r="2.3" />
    <circle cx="6" cy="18" r="2.3" />
    <circle cx="18" cy="12" r="2.3" />
    <path d="M8.3 6H13a3 3 0 0 1 3 3v.7M8.3 18H13a3 3 0 0 0 3-3v-.7" />
  </Svg>
)
export const Template = (p) => (
  <Svg sw={1.9} {...p}>
    <rect x="8" y="8" width="13" height="13" rx="2" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
  </Svg>
)
export const HistoryGlyph = (p) => (
  <Svg sw={1.9} {...p}>
    <path d="M3.2 12a8.8 8.8 0 1 0 2.8-6.5L3 8" />
    <path d="M3 3.2V8h4.8" />
    <path d="M12 7.8V12l3 1.8" />
  </Svg>
)
export const Plug = (p) => (
  <Svg sw={1.9} {...p}>
    <path d="M9 17H7a5 5 0 0 1 0-10h2" />
    <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
    <path d="M8 12h8" />
  </Svg>
)
export const TrendUp = (p) => <Svg {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></Svg>
