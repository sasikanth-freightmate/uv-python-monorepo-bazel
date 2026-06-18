'use client'
import { Icon } from '../lib/icons.jsx'
import { NODE_CATEGORIES, NODE_DEFS, NODE_W, RUN_STEP_STATUS, DIFF_STATUS } from '../lib/tokens.js'
import { Alert, Check, Spinner, X, Minus } from '../lib/glyphs.jsx'

// Pure node visuals — the bordered card body with NO positioning, NO ports and
// NO mouse handlers. Shared by the bespoke positioned NodeCard and by every
// React Flow custom node so the look stays in exactly one place.
//
// Three flavours, one per canvas:
//   NodeBody    — editor (build): needs-setup / live run-state decoration
//   RunNodeBody — run detail: execution status badge + branch-taken rows
//   VerNodeBody — versions: diff tag + removed/added styling

// ---- editor ----------------------------------------------------------------
export function NodeBody({ node, selected, runState }) {
  const def = NODE_DEFS[node.type]
  const cat = NODE_CATEGORIES[def.cat]
  const isCond = node.type === 'condition'
  const rs = runState
  const skipped = rs && rs.st === 'skip'

  let border = selected ? '#0E6EFF' : '#E4E7EC'
  let ring = selected
    ? '0 0 0 3px rgba(14,110,255,.16), 0 6px 18px -10px rgba(20,24,32,.22)'
    : '0 2px 5px -3px rgba(20,24,32,.18), 0 8px 22px -16px rgba(20,24,32,.22)'
  if (rs) {
    const pal = {
      ok: { bd: '#BCE3CF' }, error: { bd: '#F2C9CA' }, running: { bd: '#9FC4FF' }, skip: { bd: '#E4E7EC' },
    }[rs.st]
    if (!selected) border = pal.bd
    if (rs.st === 'running') ring = '0 0 0 3px rgba(14,110,255,.18)'
    else if (!selected) ring = '0 2px 5px -3px rgba(20,24,32,.16)'
  }

  const statusDot = {
    width: 8, height: 8, borderRadius: '50%', flex: 'none', marginTop: 5,
    background: rs
      ? (rs.st === 'ok' ? '#22C277' : rs.st === 'running' ? '#0E6EFF' : rs.st === 'error' ? '#E5484D' : '#D7DBE2')
      : (node.configured ? '#cfd4dc' : '#E6A100'),
    boxShadow: rs && rs.st === 'running' ? '0 0 0 3px rgba(14,110,255,.2)' : 'none',
    animation: rs && rs.st === 'running' ? 'fmpulse 1s ease-in-out infinite' : 'none',
  }

  let footer = null
  if (!rs && !node.configured) {
    footer = (
      <div className="flex items-center gap-[7px] rounded-b-[13px] border-t border-[#F5E6C8] bg-[#FFFAF0] px-[13px] py-[8px] text-[12px] font-semibold text-[#B07A00]">
        <Alert size={14} style={{ color: '#DD9500' }} />
        <span>Needs setup</span>
      </div>
    )
  } else if (rs && (rs.st === 'ok' || rs.st === 'running' || rs.st === 'error' || rs.st === 'skip')) {
    const fpal = {
      ok: { c: '#10905C', bg: '#F4FBF7', bd: '#E2F0E8', label: 'Completed' },
      running: { c: '#0E6EFF', bg: '#F2F7FF', bd: '#DCEAFF', label: 'Running…' },
      error: { c: '#CC3338', bg: '#FDF3F3', bd: '#F4DEDF', label: 'Failed' },
      skip: { c: '#A0A6B0', bg: '#FAFAFB', bd: '#EEF0F2', label: 'Skipped' },
    }[rs.st]
    footer = (
      <div
        className="flex items-center gap-[7px] rounded-b-[13px] border-t px-[13px] py-[8px] text-[11.5px] font-semibold"
        style={{ color: fpal.c, background: fpal.bg, borderColor: fpal.bd }}
      >
        {rs.st === 'running' && <Spinner size={13} style={{ color: '#10905C', animation: 'fmspin .8s linear infinite' }} />}
        {rs.st === 'ok' && <Check size={14} style={{ color: '#10905C' }} />}
        <span>{fpal.label}</span>
        <span className="flex-1" />
        {rs.ms != null && rs.st !== 'running' && (
          <span className="font-mono text-[11.5px]" style={{ color: fpal.c, opacity: 0.7 }}>{rs.ms} ms</span>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        width: NODE_W, background: '#fff', border: '1px solid ' + border, borderRadius: 14,
        boxShadow: ring, userSelect: 'none', opacity: skipped ? 0.62 : 1,
        transition: 'box-shadow .12s, border-color .12s',
      }}
    >
      <div className="flex items-start gap-[11px] px-[13px] pb-[12px] pt-[13px]">
        <div
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px]"
          style={{ background: skipped ? '#F1F2F4' : cat.bg, filter: skipped ? 'grayscale(1)' : 'none' }}
        >
          <Icon kind={def.kind} color={skipped ? '#A0A6B0' : cat.c} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[14.5px] font-semibold leading-[1.25] text-[#1B2029]">
            {node.title}
          </div>
          <div className="mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-[1.3] text-[#98A0AB]">
            {node.sub}
          </div>
        </div>
        <div style={statusDot} />
      </div>

      {isCond && <ConditionRows />}

      {footer}
    </div>
  )
}

function ConditionRows() {
  return (
    <div className="border-t border-[#EEF0F3]">
      <div className="flex h-[30px] items-center gap-[8px] px-[13px]">
        <span className="h-[7px] w-[7px] flex-none rounded-full bg-[#22C277]" />
        <span className="text-[12px] font-bold text-[#10905C]">True</span>
        <span className="flex-1" />
        <span className="text-[11px] font-medium text-[#B6BBC4]">matches</span>
      </div>
      <div className="flex h-[30px] items-center gap-[8px] border-t border-[#F3F4F6] px-[13px]">
        <span className="h-[7px] w-[7px] flex-none rounded-full bg-[#C2C8D2]" />
        <span className="text-[12px] font-bold text-[#6B7280]">False</span>
        <span className="flex-1" />
        <span className="text-[11px] font-medium text-[#B6BBC4]">otherwise</span>
      </div>
    </div>
  )
}

// ---- run detail ------------------------------------------------------------
// `decor`: { runState:{st,ms}, selected, isCondition, trueTaken, falseTaken }
export function RunNodeBody({ node, decor }) {
  const def = NODE_DEFS[node.type]
  const cat = NODE_CATEGORIES[def.cat]
  const st = decor.runState || { st: 'skip' }
  const selected = decor.selected
  const pal = RUN_STEP_STATUS[st.st] || RUN_STEP_STATUS.skip
  const skipped = st.st === 'skip'
  const badge = st.st === 'ok' ? <Check size={14} style={{ color: pal.badgeC }} />
    : st.st === 'error' ? <X size={14} style={{ color: pal.badgeC }} />
      : st.st === 'running' ? <Spinner size={13} style={{ color: pal.badgeC }} />
        : <Minus size={13} style={{ color: pal.badgeC }} />

  return (
    <div
      style={{
        width: NODE_W, background: '#fff',
        border: '1px solid ' + (selected ? '#0E6EFF' : pal.bd), borderRadius: 14,
        boxShadow: selected ? '0 0 0 3px rgba(14,110,255,.16)' : '0 2px 5px -3px rgba(20,24,32,.16)',
        opacity: skipped ? 0.62 : 1, userSelect: 'none',
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

      {decor.isCondition && (
        <div className="border-t border-[#EEF0F3]">
          <BranchRow label="True" taken={decor.trueTaken && !skipped} />
          <BranchRow label="False" taken={decor.falseTaken && !skipped} border />
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

// ---- versions diff ---------------------------------------------------------
// `decor`: { diff:'view'|'same'|'added'|'removed'|'changed' }. Uses node.summary.
export function VerNodeBody({ node, decor }) {
  const def = NODE_DEFS[node.type]
  const cat = NODE_CATEGORIES[def.cat]
  const diff = decor.diff || 'view'
  const pal = DIFF_STATUS[diff]
  const removed = diff === 'removed'
  return (
    <div
      style={{
        width: NODE_W, background: pal.bg,
        border: (removed ? '1.5px dashed ' : '1px solid ') + pal.bd, borderRadius: 14,
        boxShadow: removed ? 'none' : '0 2px 5px -3px rgba(20,24,32,.18), 0 8px 22px -16px rgba(20,24,32,.2)',
        opacity: removed ? 0.66 : 1, userSelect: 'none', position: 'relative',
      }}
    >
      {pal.rc && (
        <span
          className="absolute right-[12px] top-[-10px] whitespace-nowrap rounded-[7px] px-[8px] py-[2px] text-[10.5px] font-bold tracking-[.02em]"
          style={{ color: pal.rc, background: pal.rbg, border: '1px solid ' + pal.bd }}
        >
          {pal.tag}
        </span>
      )}
      <div className="flex items-start gap-[11px] px-[14px] py-[13px]">
        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px]" style={{ background: removed ? '#F1F2F4' : cat.bg, filter: removed ? 'grayscale(1)' : 'none' }}>
          <Icon kind={def.kind} color={removed ? '#A0A6B0' : cat.c} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[14.5px] font-semibold leading-[1.25] text-[#1B2029]">{node.title}</div>
          <div className="mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-[1.3] text-[#98A0AB]">{node.summary}</div>
        </div>
      </div>

      {node.type === 'condition' && <ConditionRows />}
    </div>
  )
}
