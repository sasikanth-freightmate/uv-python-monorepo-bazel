import { cn } from '../lib/utils.js'

// Surface card used across dashboard stats, connection/template tiles, panels.
export function Card({ className, hover, style, ...props }) {
  return (
    <div
      className={cn(
        'rounded-[14px] border border-[#E6E8EC] bg-white',
        hover && 'transition-[border-color,box-shadow] duration-150 hover:border-[#CBD8EC] hover:shadow-[0_8px_22px_-16px_rgba(20,24,32,.4)]',
        className,
      )}
      style={style}
      {...props}
    />
  )
}

/** Soft rounded square holding a node/category icon. */
export function IconChip({ children, bg, size = 40, radius = 11, className, style }) {
  return (
    <div
      className={cn('flex flex-none items-center justify-center', className)}
      style={{ width: size, height: size, borderRadius: radius, background: bg, ...style }}
    >
      {children}
    </div>
  )
}
