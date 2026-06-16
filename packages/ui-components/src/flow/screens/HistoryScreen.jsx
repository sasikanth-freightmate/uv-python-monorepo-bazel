'use client'
import { Badge } from '../../ui/badge.jsx'
import { SearchInput } from '../../ui/input.jsx'
import { RUN_STATUS } from '../../lib/tokens.js'

const GRID = '118px 1.4fr 1fr 104px 86px 76px 96px'

// Run history (spec §7): status filter chips, search, and a table newest-first.
export function HistoryScreen({ vm }) {
  return (
    <div className="fmscroll absolute inset-0 overflow-y-auto bg-[#F4F5F7]">
      <div className="mx-auto max-w-[1180px] px-[32px] pb-[64px] pt-[24px]">

        <div className="mb-[18px] flex items-center gap-[12px]">
          <div className="flex items-center gap-[2px] rounded-[11px] border border-[#E6E8EC] bg-white p-[4px]">
            {vm.filters.map((f) => (
              <button
                key={f.k}
                onClick={f.onClick}
                className="flex items-center gap-[7px] rounded-[8px] px-[12px] py-[7px] text-[13px] font-semibold transition-colors"
                style={{ color: f.active ? '#0E6EFF' : '#6B7280', background: f.active ? '#EAF2FF' : 'transparent' }}
              >
                <span>{f.label}</span>
                <span
                  className="rounded-[6px] px-[6px] py-[1px] text-[11px] font-bold tabular-nums"
                  style={{ background: f.active ? '#D6E6FF' : '#F1F2F4', color: f.active ? '#0E6EFF' : '#9AA1AC' }}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <SearchInput
            value={vm.query}
            onChange={vm.onSearch}
            placeholder="Search runs, workflows, shipment IDs…"
            wrapClassName="w-[300px]"
          />
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[#E6E8EC] bg-white">
          <div
            className="grid gap-[14px] border-b border-[#ECEEF1] bg-[#FBFBFC] px-[20px] py-[12px]"
            style={{ gridTemplateColumns: GRID }}
          >
            {['Run', 'Workflow', 'Trigger', 'Status', 'Duration', 'Steps', 'Started'].map((h, i) => (
              <div
                key={h}
                className="text-[11px] font-bold uppercase tracking-[.05em] text-[#A6ACB6]"
                style={{ textAlign: i >= 4 ? 'right' : 'left' }}
              >
                {h}
              </div>
            ))}
          </div>

          {vm.rows.map((r) => {
            const pal = RUN_STATUS[r.status]
            return (
              <div
                key={r.id}
                onClick={r.onClick}
                className="grid cursor-pointer items-center gap-[14px] border-b border-[#F2F3F5] px-[20px] py-[13px] transition-colors hover:bg-[#F7F9FC]"
                style={{ gridTemplateColumns: GRID }}
              >
                <div className="font-mono text-[13.5px] font-semibold text-[#0E6EFF]">{r.id}</div>
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-medium text-[#1B2029]">{r.wf}</div>
                <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] text-[#6B7280]">{r.trigger}</div>
                <div><Badge color={pal.c} bg={pal.bg} className="text-[11.5px]">{pal.label}</Badge></div>
                <div className="text-right font-mono text-[13px] tabular-nums text-[#3A4150]">{r.dur}</div>
                <div className="text-right font-mono text-[13px] text-[#3A4150]">{r.steps}</div>
                <div className="text-right text-[12.5px] text-[#9AA1AC]">{r.when}</div>
              </div>
            )
          })}

          {vm.empty && (
            <div className="px-[20px] py-[64px] text-center">
              <div className="text-[14px] font-semibold text-[#6B7280]">No runs match</div>
              <div className="mt-[5px] text-[12.5px] text-[#9AA1AC]">Try a different filter or search term.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
