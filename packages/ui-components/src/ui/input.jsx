import { cn } from '../lib/utils.js'
import { Search } from '../lib/glyphs.jsx'

export function Input({ className, ...props }) {
  return (
    <input
      spellCheck={false}
      className={cn(
        'h-[40px] w-full rounded-[9px] border border-[#E0E2E7] bg-white px-[12px] text-[13.5px] text-[#181B22] outline-none',
        'placeholder:text-[#9AA1AC] focus:border-[#0E6EFF] focus:shadow-[0_0_0_3px_rgba(14,110,255,.12)]',
        className,
      )}
      {...props}
    />
  )
}

/** Search field with a leading magnifier; used by dashboards and pickers. */
export function SearchInput({ className, wrapClassName, ...props }) {
  return (
    <div
      className={cn(
        'flex h-[40px] items-center gap-[9px] rounded-[10px] border border-[#E6E8EC] bg-white px-[13px]',
        wrapClassName,
      )}
    >
      <Search size={15} style={{ color: '#9AA1AC' }} />
      <input
        spellCheck={false}
        className={cn(
          'w-full border-none bg-transparent text-[13.5px] text-[#181B22] outline-none placeholder:text-[#9AA1AC]',
          className,
        )}
        {...props}
      />
    </div>
  )
}
