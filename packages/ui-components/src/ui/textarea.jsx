import { cn } from '../lib/utils.js'

export function Textarea({ className, ...props }) {
  return (
    <textarea
      spellCheck={false}
      className={cn(
        'min-h-[92px] w-full resize-y rounded-[9px] border border-[#E0E2E7] bg-white px-[12px] py-[10px] text-[13.5px] leading-[1.6] text-[#181B22] outline-none',
        'placeholder:text-[#9AA1AC] focus:border-[#0E6EFF] focus:shadow-[0_0_0_3px_rgba(14,110,255,.12)]',
        className,
      )}
      {...props}
    />
  )
}
