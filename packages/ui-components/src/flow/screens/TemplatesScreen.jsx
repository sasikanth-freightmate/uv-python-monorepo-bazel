'use client'
import { Card, IconChip } from '../../ui/card.jsx'
import { Button } from '../../ui/button.jsx'
import { Icon } from '../../lib/icons.jsx'
import { Plus, ArrowRight, Flow } from '../../lib/glyphs.jsx'

// Template gallery (spec §2). Hero "blank workflow" card + a grid of freight
// templates, each opening a draft in the editor.
export function TemplatesScreen({ vm }) {
  return (
    <div className="fmscroll absolute inset-0 overflow-y-auto bg-[#F4F5F7]">
      <div className="mx-auto max-w-[1020px] px-[32px] pb-[64px] pt-[28px]">

        <div className="mb-[28px] flex items-center gap-[18px] rounded-[16px] bg-gradient-to-r from-[#0E1116] to-[#1E2535] px-[26px] py-[22px]">
          <div className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[13px] bg-gradient-to-br from-[#6E7BF2] to-[#0E6EFF]">
            <Plus size={22} style={{ color: '#fff' }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16.5px] font-bold text-white">Start from a blank canvas</div>
            <div className="mt-[3px] text-[13px] text-[#A9B2C2]">Drop in a trigger and build your own automation step by step.</div>
          </div>
          <Button className="flex-none bg-white text-[#0E1116] hover:bg-[#EEF1F6]" onClick={vm.onScratch}>
            Blank workflow
          </Button>
        </div>

        <div className="mb-[13px] text-[14px] font-bold text-[#181B22]">Freight templates</div>

        <div className="grid grid-cols-2 gap-[14px]">
          {vm.templates.map((t) => (
            <Card key={t.name} hover onClick={t.onUse} className="flex cursor-pointer flex-col p-[18px]">
              <div className="flex items-start gap-[13px]">
                <IconChip bg={t.bg} size={42} radius={12}><Icon kind={t.kind} color={t.color} size={20} /></IconChip>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[9px]">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold text-[#1B2029]">{t.name}</span>
                    {t.popular && (
                      <span className="flex-none rounded-[5px] bg-[#FCF1DD] px-[7px] py-[2px] text-[10.5px] font-bold text-[#B07A00]">Popular</span>
                    )}
                  </div>
                  <div className="mt-[4px] text-[11px] font-bold uppercase tracking-[.03em]" style={{ color: t.color }}>{t.cat}</div>
                </div>
              </div>
              <div className="mt-[12px] min-h-[39px] text-[13px] leading-[1.5] text-[#5C6470]">{t.desc}</div>
              <div className="mt-[14px] flex items-center justify-between border-t border-[#F1F2F4] pt-[13px]">
                <span className="flex items-center gap-[6px] text-[12px] text-[#9AA1AC]">
                  <Flow size={13} style={{ color: '#B6BCC6' }} />
                  {t.stepsLabel}
                </span>
                <span className="flex items-center gap-[5px] text-[13px] font-semibold text-[#0E6EFF]">
                  Use template
                  <ArrowRight size={14} style={{ color: '#0E6EFF' }} />
                </span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
