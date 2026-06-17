'use client'
import { PaletteSidebar } from '../PaletteSidebar.jsx'
import { ConfigPanel } from '../ConfigPanel.jsx'
import { FlowCanvas } from '../rf/FlowCanvas.jsx'
import { Button } from '../../ui/button.jsx'
import { Plus, Minus, Fit, Check } from '../../lib/glyphs.jsx'

// Workflow editor (spec §3) — the canvas. Palette rail, a React Flow canvas
// with nodes + edges + pan/zoom, zoom controls, and the slide-in config panel.
export function EditorScreen({ vm }) {
  const c = vm.canvas
  return (
    <div className="absolute inset-0 flex min-h-0 min-w-0">
      <PaletteSidebar vm={vm.palette} />

      <div className="relative flex min-w-0 flex-1 overflow-hidden">
        <FlowCanvas vm={c.flow} />

        {c.showEmpty && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="pointer-events-auto text-center" style={{ animation: 'fmrise .4s ease both' }}>
              <div className="mx-auto mb-[18px] flex h-[62px] w-[62px] items-center justify-center rounded-[16px] border border-[#E6E8EC] bg-white shadow-[0_8px_24px_-14px_rgba(20,24,32,.25)]">
                <Plus size={26} style={{ color: '#0E6EFF' }} />
              </div>
              <div className="mb-[6px] text-[18px] font-bold text-[#1B2029]">Build your first workflow</div>
              <div className="mx-auto mb-[18px] max-w-[280px] text-[13.5px] leading-[1.5] text-[#8A919C]">
                Every workflow starts with a trigger — an event that kicks things off automatically.
              </div>
              <Button variant="primary" size="lg" onClick={c.onAddTrigger}>
                <Plus size={16} />
                Add a trigger
              </Button>
            </div>
          </div>
        )}

        {/* zoom + layout controls */}
        <div className="absolute bottom-[18px] left-[18px] z-10 flex items-center gap-[6px] rounded-[11px] border border-[#E6E8EC] bg-white p-[5px] shadow-[0_4px_14px_-8px_rgba(20,24,32,.22)]">
          <button onClick={c.onZoomOut} className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-[#5C6470] hover:bg-[#F4F5F7]"><Minus size={16} /></button>
          <div onClick={c.onZoomReset} className="min-w-[42px] cursor-pointer text-center font-mono text-[12.5px] font-semibold tabular-nums text-[#5C6470]">{c.zoomPct}</div>
          <button onClick={c.onZoomIn} className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-[#5C6470] hover:bg-[#F4F5F7]"><Plus size={16} /></button>
          <div className="mx-[1px] h-[18px] w-px bg-[#E6E8EC]" />
          <button onClick={c.onFit} title="Fit to view" className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-[#5C6470] hover:bg-[#F4F5F7]"><Fit size={15} /></button>
          <button onClick={c.onTidy} title="Tidy up (auto-layout)" className="flex h-[30px] items-center gap-[6px] rounded-[7px] px-[9px] text-[12.5px] font-semibold text-[#5C6470] hover:bg-[#F4F5F7]"><TidyGlyph />Tidy</button>
        </div>

        {c.showRunBanner && (
          <div
            className="absolute left-1/2 top-[18px] z-20 flex -translate-x-1/2 items-center gap-[20px] rounded-[13px] border border-[#E6E8EC] bg-white py-[11px] pl-[16px] pr-[13px] shadow-[0_12px_30px_-14px_rgba(20,24,32,.3)]"
            style={{ animation: 'fmrise .3s ease both' }}
          >
            <div className="flex items-center gap-[11px]">
              <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[#E3F6EC]"><Check size={18} style={{ color: '#10905C' }} /></div>
              <div>
                <div className="text-[13.5px] font-bold text-[#1B2029]">Run completed successfully</div>
                <div className="mt-[1px] text-[12px] text-[#8A919C]">6 steps · 0.79s · just now</div>
              </div>
            </div>
            <Button variant="dark" size="sm" className="h-[34px]" onClick={c.onOpenRun}>View run details</Button>
          </div>
        )}
      </div>

      {vm.config.sel && <ConfigPanel vm={vm.config} />}
    </div>
  )
}

function TidyGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="7" height="6" rx="1" /><rect x="14" y="4" width="7" height="6" rx="1" />
      <rect x="3" y="14" width="7" height="6" rx="1" /><rect x="14" y="14" width="7" height="6" rx="1" />
    </svg>
  )
}
