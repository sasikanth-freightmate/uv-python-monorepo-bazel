import { cn } from '../lib/utils.js'
import { ChevronDown } from '../lib/glyphs.jsx'

// Native select dressed as a shadcn trigger (chevron overlay, no default arrow).
export function Select({ className, options = [], children, ...props }) {
  return (
    <div className="relative">
      <select
        className={cn(
          'h-[40px] w-full cursor-pointer appearance-none rounded-[9px] border border-[#E0E2E7] bg-white pl-[12px] pr-[36px] text-[13.5px] text-[#181B22] outline-none',
          'focus:border-[#0E6EFF] focus:shadow-[0_0_0_3px_rgba(14,110,255,.12)]',
          className,
        )}
        {...props}
      >
        {children || options.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
      <ChevronDown
        size={16}
        style={{ color: '#9AA1AC', position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
      />
    </div>
  )
}
