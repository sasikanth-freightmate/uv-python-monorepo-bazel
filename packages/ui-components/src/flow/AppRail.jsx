'use client'
import { cn } from '../lib/utils.js'

// Left navigation rail. `items` is the nav model from the orchestrator:
// { key, label, active, icon (a glyph component), onClick }.
export function AppRail({ items = [], avatar = 'OM' }) {
  return (
    <div className="z-50 flex h-full w-[62px] flex-none flex-col items-center bg-[#0E1116] pb-[16px] pt-[14px]">
      <div className="mb-[16px] flex h-[36px] w-[36px] flex-none items-center justify-center rounded-[10px] bg-gradient-to-br from-[#6E7BF2] to-[#0E6EFF]">
        <div className="h-[15px] w-[15px] rounded-[4px] bg-white" />
      </div>
      <div className="flex flex-col items-center gap-[6px]">
        {items.map((it) => {
          const Glyph = it.icon
          return (
            <button
              key={it.key}
              onClick={it.onClick}
              title={it.label}
              className={cn(
                'flex h-[40px] w-[40px] items-center justify-center rounded-[11px] transition-colors',
                it.active ? 'bg-[#0E6EFF]' : 'bg-transparent hover:bg-white/5',
              )}
            >
              <Glyph
                size={19}
                style={{ color: it.active ? '#FFFFFF' : '#7E8896' }}
                sw={it.active ? 2.05 : 1.85}
              />
            </button>
          )
        })}
      </div>
      <div className="flex-1" />
      <div className="flex h-[36px] w-[36px] flex-none items-center justify-center rounded-[11px] bg-[#262B33] text-[12.5px] font-bold text-white">
        {avatar}
      </div>
    </div>
  )
}
