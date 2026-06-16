'use client'
import { Card, IconChip } from '../../ui/card.jsx'
import { Badge } from '../../ui/badge.jsx'
import { Button } from '../../ui/button.jsx'
import { Icon } from '../../lib/icons.jsx'
import { CONNECTION_STATUS } from '../../lib/tokens.js'

// Connections / integrations (spec: Supporting screens — Settings › sources).
export function ConnectionsScreen({ vm }) {
  return (
    <div className="fmscroll absolute inset-0 overflow-y-auto bg-[#F4F5F7]">
      <div className="mx-auto max-w-[1020px] px-[32px] pb-[64px] pt-[28px]">

        <div className="mb-[26px] flex gap-[14px]">
          {vm.stats.map((cs) => (
            <Card key={cs.label} className="flex flex-1 items-center gap-[13px] px-[18px] py-[15px]" style={{ borderRadius: 13 }}>
              <IconChip bg={cs.bg} size={40} radius={11}>{cs.glyph}</IconChip>
              <div>
                <div className="font-mono text-[23px] font-bold leading-none tabular-nums text-[#181B22]">{cs.value}</div>
                <div className="mt-[5px] text-[12.5px] text-[#8A919C]">{cs.label}</div>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-[14px]">
          {vm.connections.map((c) => {
            const pal = CONNECTION_STATUS[c.status]
            return (
              <Card key={c.name} hover className="px-[18px] py-[17px]">
                <div className="flex items-start gap-[13px]">
                  <IconChip bg={c.bg} size={42} radius={12}><Icon kind={c.kind} color={c.color} size={20} /></IconChip>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-[9px]">
                      <span className="whitespace-nowrap text-[15px] font-semibold text-[#1B2029]">{c.name}</span>
                      <Badge color={pal.c} bg={pal.bg} className="flex-none">{pal.label}</Badge>
                    </div>
                    <div className="mt-[3px] text-[12.5px] text-[#8A919C]">{c.cat}</div>
                  </div>
                </div>
                <div className="mt-[14px] flex items-center gap-[8px] text-[12.5px] text-[#5C6470]">
                  <div className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: pal.dot }} />
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{c.detail}</span>
                </div>
                <div className="mt-[14px] flex items-center justify-between border-t border-[#F1F2F4] pt-[13px]">
                  <span className="text-[12px] text-[#9AA1AC]">{c.flowsLabel}</span>
                  <Button
                    size="sm"
                    variant={c.status === 'error' ? 'warn' : c.status === 'available' ? 'primary' : 'outline'}
                    className={c.status !== 'error' ? '' : 'shadow-none'}
                    onClick={c.onManage}
                  >
                    {c.btnLabel}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
