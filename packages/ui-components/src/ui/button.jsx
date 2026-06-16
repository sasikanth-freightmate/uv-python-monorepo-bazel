import { cva } from 'class-variance-authority'
import { cn } from '../lib/utils.js'

// shadcn-style button, retuned to the FM Flow palette (Signal Blue primary,
// neutral outline, freight greens/ambers for lifecycle actions).
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-[9px] font-semibold transition-colors cursor-pointer outline-none disabled:pointer-events-none disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[#0E6EFF]/30',
  {
    variants: {
      variant: {
        primary: 'bg-[#0E6EFF] text-white border-none shadow-[0_4px_12px_-5px_rgba(14,110,255,.6)] hover:bg-[#0A5CDB]',
        outline: 'bg-white text-[#3A4150] border border-[#E0E2E7] hover:bg-[#F7F8FA]',
        ghost: 'bg-transparent text-[#5C6470] border-none hover:bg-[#F4F5F7]',
        success: 'bg-[#10905C] text-white border-none shadow-[0_4px_12px_-5px_rgba(16,144,92,.6)] hover:bg-[#0C7A4D]',
        danger: 'bg-[#FDF3F3] text-[#CC3338] border border-[#F2C9CA] hover:bg-[#FBE9E9]',
        warn: 'bg-[#DD8400] text-white border-none hover:bg-[#C57600]',
        dark: 'bg-[#0E1116] text-white border-none hover:bg-[#262b34]',
      },
      size: {
        sm: 'h-[32px] px-[13px] text-[12.5px]',
        md: 'h-[38px] px-[15px] text-[13.5px]',
        lg: 'h-[40px] px-[18px] text-[14px]',
        icon: 'h-[30px] w-[30px] p-0 rounded-[7px]',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md' },
  },
)

export function Button({ className, variant, size, type = 'button', ...props }) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { buttonVariants }
