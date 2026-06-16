'use client'
import { Card, IconChip } from '../../ui/card.jsx'
import { Badge } from '../../ui/badge.jsx'
import { Button } from '../../ui/button.jsx'
import { Icon } from '../../lib/icons.jsx'
import { Plus, ChevronRight, Bolt, Play, Pause } from '../../lib/glyphs.jsx'
import { WORKFLOW_STATUS } from '../../lib/tokens.js'

// Workflow list / dashboard (spec §1). Stat cards + a row per workflow with
// status, trigger, health and a pause/resume toggle.
export function DashboardScreen({ vm }) {
  return (
    <div className="fmscroll absolute inset-0 overflow-y-auto bg-[#F4F5F7]">
      <div className="mx-auto max-w-[1080px] px-[32px] pb-[64px] pt-[30px]">

        <div className="mb-[30px] grid grid-cols-4 gap-[16px]">
          {vm.stats.map((st) => (
            <Card key={st.label} className="px-[18px] py-[16px]">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-[#8A919C]">{st.label}</span>
                <IconChip bg={st.bg} size={30} radius={9}>{st.glyph}</IconChip>
              </div>
              <div className="mt-[12px] font-mono text-[28px] font-bold tabular-nums text-[#181B22]">{st.value}</div>
              <div className="mt-[8px] text-[12px] font-semibold" style={{ color: st.good ? '#10905C' : '#C98A00' }}>
                {st.delta}
              </div>
            </Card>
          ))}
        </div>

        <div className="mb-[14px] flex items-end justify-between">
          <div>
            <div className="text-[17px] font-bold text-[#181B22]">Workflows</div>
            <div className="mt-[3px] text-[13px] text-[#8A919C]">{vm.wfCountLabel}</div>
          </div>
          <Button variant="primary" onClick={vm.onNewWorkflow}>
            <Plus size={15} />
            New workflow
          </Button>
        </div>

        <div className="flex flex-col gap-[10px]">
          {vm.workflows.map((w) => {
            const pill = WORKFLOW_STATUS[w.status]
            const cc = w.status === 'draft'
              ? { c: '#8A919C', bg: '#F1F2F4' }
              : w.status === 'paused'
                ? { c: '#B07A00', bg: '#FCF1DD' }
                : { c: '#0E6EFF', bg: '#EAF2FF' }
            const lastDot = w.status === 'paused' ? '#D7A53A'
              : w.lastStatus === 'success' ? '#22C277'
                : w.lastStatus === 'error' ? '#E5484D'
                  : w.lastStatus === 'paused' ? '#D7A53A' : '#C6CBD3'
            return (
              <Card
                key={w.id}
                hover
                onClick={w.onOpen}
                className="flex cursor-pointer items-center gap-[16px] px-[18px] py-[14px]"
              >
                <IconChip bg={cc.bg}><Icon kind="branch" color={cc.c} size={20} /></IconChip>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[9px]">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold text-[#1B2029]">{w.name}</span>
                    <Badge color={pill.c} bg={pill.bg} className="flex-none">{pill.label}</Badge>
                  </div>
                  <div className="mt-[4px] flex items-center gap-[7px] whitespace-nowrap text-[12.5px] text-[#8A919C]">
                    <Bolt size={13} style={{ color: '#A6ACB6', flex: 'none' }} />
                    <span className="overflow-hidden text-ellipsis">{w.trigger}</span>
                    <span className="flex-none opacity-50">·</span>
                    <span className="flex-none">{w.stepsLabel}</span>
                  </div>
                </div>
                <div className="w-[132px] flex-none">
                  <div className="text-[13px] font-semibold text-[#3A4150]">{w.successLabel}</div>
                  <div className="mt-[3px] text-[12px] text-[#9AA1AC]">{w.runsLabel}</div>
                </div>
                <div className="flex w-[148px] flex-none items-center gap-[9px]">
                  <div className="h-[8px] w-[8px] flex-none rounded-full" style={{ background: lastDot }} />
                  <div className="min-w-0">
                    <div className="whitespace-nowrap text-[12.5px] font-medium text-[#5C6470]">{w.last}</div>
                    <div className="mt-[2px] whitespace-nowrap text-[11.5px] text-[#A6ACB6]">last run</div>
                  </div>
                </div>
                {w.canToggle && (
                  <button
                    onClick={w.onToggle}
                    title={w.status === 'paused' ? 'Resume workflow' : 'Pause workflow'}
                    className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] border"
                    style={{
                      borderColor: w.status === 'paused' ? '#BFE6D2' : '#E6E8EC',
                      background: w.status === 'paused' ? '#F2FBF6' : '#fff',
                      color: w.status === 'paused' ? '#10905C' : '#8A919C',
                    }}
                  >
                    {w.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}
                  </button>
                )}
                <ChevronRight size={18} style={{ color: '#C6CBD3', flex: 'none' }} />
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
