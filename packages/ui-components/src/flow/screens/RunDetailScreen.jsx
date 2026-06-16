'use client'
import { IconChip } from '../../ui/card.jsx'
import { Badge } from '../../ui/badge.jsx'
import { Button } from '../../ui/button.jsx'
import { Icon } from '../../lib/icons.jsx'
import { CanvasEdges } from '../CanvasEdges.jsx'
import { RunInspector } from '../RunInspector.jsx'
import { Spinner, Check, X, Minus, Stop, Restore } from '../../lib/glyphs.jsx'
import { NODE_W, RUN_STEP_STATUS, NODE_CATEGORIES, NODE_DEFS } from '../../lib/tokens.js'

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

        <div
          ref={vm.runViewportRef}
          onMouseDown={vm.onRunPanDown}
          className="relative min-h-0 flex-1 cursor-grab overflow-hidden bg-[#F4F5F7]"
        >
          <div style={vm.runCanvasStyle}>
            <CanvasEdges edges={vm.runEdges} />
            {vm.runNodes.map((rn) => (
              <RunNode key={rn.node.id} rn={rn} />
            ))}
          </div>
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

// Execution node: base card + status badge, condition branch-taken rows, footer.
function RunNode({ rn }) {
  const { node, runState: st, selected } = rn
  const def = NODE_DEFS[node.type]
  const cat = NODE_CATEGORIES[def.cat]
  const pal = RUN_STEP_STATUS[st.st] || RUN_STEP_STATUS.skip
  const skipped = st.st === 'skip'
  const badge = st.st === 'ok' ? <Check size={14} style={{ color: pal.badgeC }} />
    : st.st === 'error' ? <X size={14} style={{ color: pal.badgeC }} />
      : st.st === 'running' ? <Spinner size={13} style={{ color: pal.badgeC }} />
        : <Minus size={13} style={{ color: pal.badgeC }} />

  return (
    <div
      onMouseDown={rn.onSelect}
      style={{
        position: 'absolute', left: node.x, top: node.y, width: NODE_W, background: '#fff',
        border: '1px solid ' + (selected ? '#0E6EFF' : pal.bd), borderRadius: 14,
        boxShadow: selected ? '0 0 0 3px rgba(14,110,255,.16)' : '0 2px 5px -3px rgba(20,24,32,.16)',
        cursor: 'pointer', opacity: skipped ? 0.62 : 1, userSelect: 'none',
      }}
    >
      <div className="flex items-start gap-[11px] px-[13px] pb-[12px] pt-[13px]">
        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px]" style={{ background: skipped ? '#F1F2F4' : cat.bg, filter: skipped ? 'grayscale(1)' : 'none' }}>
          <Icon kind={def.kind} color={skipped ? '#A0A6B0' : cat.c} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[14.5px] font-semibold leading-[1.25] text-[#1B2029]">{node.title}</div>
          <div className="mt-[2px] text-[12px] leading-[1.3] text-[#98A0AB]">{node.sub}</div>
        </div>
        <div className="mt-[1px] flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px]" style={{ background: pal.badgeBg }}>{badge}</div>
      </div>

      {rn.isCondition && (
        <div className="border-t border-[#EEF0F3]">
          <BranchRow label="True" taken={rn.trueTaken && !skipped} />
          <BranchRow label="False" taken={rn.falseTaken && !skipped} border />
        </div>
      )}

      <div className="flex items-center gap-[7px] rounded-b-[13px] border-t px-[13px] py-[7px] text-[11.5px] font-semibold" style={{ color: pal.ft, background: pal.ftBg, borderColor: pal.ftBorder }}>
        <span>{pal.label}</span>
        <span className="flex-1" />
        <span className="font-mono font-semibold">{st.ms != null ? st.ms + ' ms' : '—'}</span>
      </div>
    </div>
  )
}

function BranchRow({ label, taken, border }) {
  return (
    <div className="flex h-[30px] items-center gap-[8px] px-[13px]" style={{ background: taken ? '#F2F7FF' : 'transparent', borderTop: border ? '1px solid #F3F4F6' : 'none' }}>
      <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: taken ? '#0E6EFF' : '#D7DBE2' }} />
      <span className="text-[12px] font-bold" style={{ color: taken ? '#1B2029' : '#A6ACB6' }}>{label}</span>
      <span className="flex-1" />
      {taken && <span className="rounded-[5px] bg-[#E5F0FF] px-[7px] py-[1px] text-[10.5px] font-bold text-[#0E6EFF]">taken</span>}
    </div>
  )
}
