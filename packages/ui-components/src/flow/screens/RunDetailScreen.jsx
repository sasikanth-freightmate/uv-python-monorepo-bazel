'use client'
import { IconChip } from '../../ui/card.jsx'
import { Badge } from '../../ui/badge.jsx'
import { Button } from '../../ui/button.jsx'
import { FlowCanvas } from '../rf/FlowCanvas.jsx'
import { RunInspector } from '../RunInspector.jsx'
import { Spinner, Check, X, Stop, Restore } from '../../lib/glyphs.jsx'

// Run detail / execution trace (spec §8). The same canvas, read-only, overlaid
// with per-node execution state; an executions list and the run inspector.
export function RunDetailScreen({ vm }) {
  const hero = vm.hero
  return (
    <div className="absolute inset-0 flex min-h-0 min-w-0 bg-[#F4F5F7]">
      {/* executions list */}
      <div className="flex w-[296px] min-h-0 flex-none flex-col border-r border-[#E6E8EC] bg-white">
        <div className="border-b border-[#ECEEF1] px-[18px] pb-[13px] pt-[17px]">
          <div className="text-[14px] font-bold text-[#181B22]">Executions</div>
          <div className="mt-[2px] text-[12.5px] text-[#8A919C]">{vm.runCountLabel}</div>
        </div>
        <div className="fmscroll min-h-0 flex-1 overflow-y-auto p-[8px]">
          {vm.runList.map((r) => (
            <div
              key={r.id}
              onClick={r.onClick}
              className="mb-[2px] flex cursor-pointer items-center gap-[11px] rounded-[11px] border px-[11px] py-[10px]"
              style={{ background: r.active ? '#F1F6FF' : 'transparent', borderColor: r.active ? '#DCEAFF' : 'transparent' }}
            >
              <IconChip bg={r.bg} size={30} radius={9}><RunGlyph status={r.status} color={r.c} size={15} /></IconChip>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-[7px]">
                  <span className="font-mono text-[13.5px] font-semibold text-[#1B2029]">{r.id}</span>
                  <Badge color={r.c} bg={r.bg} className="text-[10.5px]">{r.tag}</Badge>
                </div>
                <div className="mt-[3px] text-[12px] text-[#9AA1AC]">{r.meta}</div>
              </div>
              <div className="font-mono text-[12px] tabular-nums text-[#B0B5BE]">{r.dur}</div>
            </div>
          ))}
        </div>
      </div>

      {/* center: hero + canvas */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-none items-center gap-[18px] border-b border-[#E6E8EC] bg-white px-[22px] py-[15px]">
          <IconChip bg={hero.bg} size={42} radius={12}><RunGlyph status={hero.status} color={hero.c} size={20} cancelled={hero.cancelled} /></IconChip>
          <div className="min-w-0">
            <div className="flex items-center gap-[10px]">
              <span className="font-mono text-[16px] font-bold text-[#181B22]">{hero.id}</span>
              <Badge color={hero.c} bg={hero.bg} className="text-[12px]">{hero.label}</Badge>
            </div>
            <div className="mt-[3px] text-[12.5px] text-[#8A919C]">{hero.sub}</div>
          </div>
          <div className="flex-1" />
          <div className="mr-[6px] flex items-center gap-[26px]">
            <Stat label="Duration" value={hero.duration} />
            <Stat label="Steps" value={hero.steps} />
          </div>
          {hero.isRunning && (
            <Button variant="danger" onClick={hero.onCancel}><Stop size={14} />Cancel run</Button>
          )}
          {hero.isFailed && (
            <Button variant="primary" onClick={hero.onRetryFailed}><Restore size={15} />Retry from failed step</Button>
          )}
          <Button variant="outline" onClick={vm.onRerun}><Restore size={15} />Re-run</Button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#F4F5F7]">
          <FlowCanvas vm={vm.flow} />
        </div>
      </div>

      <RunInspector step={vm.step} />
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="text-right">
      <div className="text-[11px] font-semibold uppercase tracking-[.04em] text-[#A6ACB6]">{label}</div>
      <div className="mt-[3px] font-mono text-[15px] font-semibold tabular-nums text-[#3A4150]">{value}</div>
    </div>
  )
}

function RunGlyph({ status, color, size = 15, cancelled }) {
  if (status === 'running') return <Spinner size={size} style={{ color }} />
  if (status === 'error') {
    return cancelled
      ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
      : <X size={size} style={{ color }} />
  }
  return <Check size={size} style={{ color }} />
}
