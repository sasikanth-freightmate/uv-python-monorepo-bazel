'use client'
import { Icon } from '../lib/icons.jsx'
import { NODE_CATEGORIES, NODE_DEFS, NODE_W } from '../lib/tokens.js'
import { Alert, Check, Spinner } from '../lib/glyphs.jsx'

// The single node visual vocabulary, reused by the editor (build), run detail
// (execution overlay) and version-compare canvases. `overlay` selects which
// state decoration is layered on top of the base card.
//
// props.node: { id, type, title, sub, x, y, configured }
// props.selected, props.runState ({ st:'ok'|'error'|'running'|'skip', ms }),
// props.ports (editor connect handles), props.onCardDown / onSelect.
export function NodeCard({
  node,
  selected,
  runState,
  ports = false,
  dragging,
  onCardDown,
  onSelect,
  onPortDown,
  onPortUp,
  onPortDownTrue,
  onPortDownFalse,
}) {
  const def = NODE_DEFS[node.type]
  const cat = NODE_CATEGORIES[def.cat]
  const isCond = node.type === 'condition'
  const rs = runState
  const skipped = rs && rs.st === 'skip'

  // ----- border / ring -----
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

  const portBase = {
    position: 'absolute', width: 13, height: 13, borderRadius: '50%',
    background: '#fff', border: '2px solid #C4CAD3', zIndex: 3, cursor: 'crosshair',
  }
  const hasInput = node.type !== 'trigger' && node.type !== 'schedule' && node.type !== 'http_in'

  // ----- footer (needs-setup / run result) -----
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
      onMouseDown={onCardDown}
      onClick={onSelect}
      style={{
        position: 'absolute', left: node.x, top: node.y, width: NODE_W,
        background: '#fff', border: '1px solid ' + border, borderRadius: 14,
        boxShadow: ring, cursor: dragging ? 'grabbing' : ports ? 'grab' : 'pointer',
        userSelect: 'none', opacity: skipped ? 0.62 : 1,
        transition: 'box-shadow .12s, border-color .12s',
      }}
    >
      {ports && hasInput && (
        <div onMouseUp={onPortUp} style={{ ...portBase, left: -7, top: 27 }} />
      )}

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

      {isCond && <ConditionRows runState={rs} />}

      {footer}

      {ports && isCond && (
        <>
          <div onMouseDown={onPortDownTrue} style={{ ...portBase, right: -7, top: 70, borderColor: '#74C49A' }} />
          <div onMouseDown={onPortDownFalse} style={{ ...portBase, right: -7, top: 100, borderColor: '#C9CDD6' }} />
        </>
      )}
      {ports && !isCond && (
        <div onMouseDown={onPortDown} style={{ ...portBase, right: -7, top: 27 }} />
      )}
    </div>
  )
}

function ConditionRows({ runState }) {
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
