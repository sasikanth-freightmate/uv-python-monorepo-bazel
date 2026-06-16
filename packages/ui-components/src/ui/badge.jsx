import { cn } from '../lib/utils.js'

// Status pill. Colours come from the token palettes (WORKFLOW_STATUS, RUN_STATUS,
// …) and are passed in as `color` / `bg` so one component serves every domain.
export function Badge({ children, color, bg, className, style, dot, dotColor, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[6px] rounded-[6px] px-[8px] py-[2px] text-[11px] font-bold whitespace-nowrap',
        className,
      )}
      style={{ color, background: bg, ...style }}
      {...props}
    >
      {dot && (
        <span
          className="h-[7px] w-[7px] flex-none rounded-full"
          style={{ background: dotColor || color }}
        />
      )}
      {children}
    </span>
  )
}
