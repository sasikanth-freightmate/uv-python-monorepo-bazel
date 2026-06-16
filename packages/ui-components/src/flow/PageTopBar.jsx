'use client'
import { Button } from '../ui/button.jsx'

// Top bar for the non-editor pages (dashboard, history, connections, templates,
// versions). Title + subtitle on the left, a single contextual action right.
export function PageTopBar({ title, subtitle, actionLabel, actionVariant = 'outline', onAction }) {
  return (
    <div className="z-40 flex h-[60px] flex-none items-center gap-[16px] border-b border-[#E6E8EC] bg-white px-[28px]">
      <div className="min-w-0">
        <div className="text-[16px] font-bold leading-[1.15] text-[#181B22]">{title}</div>
        <div className="mt-[2px] text-[12.5px] text-[#8A919C]">{subtitle}</div>
      </div>
      <div className="flex-1" />
      {actionLabel && (
        <Button variant={actionVariant} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
