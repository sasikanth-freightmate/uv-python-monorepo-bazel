'use client'
import { IconChip } from '../ui/card.jsx'
import { Badge } from '../ui/badge.jsx'
import { Icon } from '../lib/icons.jsx'
import { ArrowRight } from '../lib/glyphs.jsx'

const JSON_BOX =
  'm-0 overflow-x-auto whitespace-pre rounded-[10px] border border-[#ECEEF1] bg-[#FAFAFB] px-[13px] py-[12px] font-mono text-[12.5px] leading-[1.6] text-[#3A4150]'

// Read-only run-node inspector (spec §8): resolved input, output, timing, error
// and a short log trace for the selected execution step.
export function RunInspector({ step }) {
  return (
    <div className="flex h-full w-[404px] min-h-0 flex-none flex-col border-l border-[#E6E8EC] bg-white">
      {step ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[#ECEEF1] px-[18px] pb-[14px] pt-[16px]">
            <div className="flex items-center gap-[11px]">
              <IconChip bg={step.catBg} size={38} radius={10}>
                <Icon kind={step.kind} color={step.catColor} size={19} />
              </IconChip>
              <div className="min-w-0 flex-1">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-bold text-[#181B22]">{step.title}</div>
                <div className="mt-[3px] flex items-center gap-[8px]">
                  <Badge color={step.statusColor} bg={step.statusBg} className="text-[11.5px]">{step.statusLabel}</Badge>
                  <span className="font-mono text-[12px] text-[#9AA1AC]">{step.dur}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="fmscroll min-h-0 flex-1 overflow-y-auto px-[18px] pb-[28px] pt-[16px]">
            {step.hasError && (
              <div className="mb-[20px] rounded-[11px] border border-[#F4D4D5] bg-[#FDF1F1] px-[14px] py-[13px]">
                <div className="mb-[7px] flex items-center gap-[8px]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D6383D" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h0" /></svg>
                  <span className="text-[13px] font-bold text-[#C5292E]">{step.errorTitle}</span>
                </div>
                <div className="font-mono text-[12.5px] leading-[1.5] text-[#A03A3E]">{step.errorMsg}</div>
              </div>
            )}

            {step.hasRefs && (
              <>
                <div className="mb-[9px] text-[11px] font-bold uppercase tracking-[.06em] text-[#A6ACB6]">Data references</div>
                <div className="mb-[20px] flex flex-col gap-[7px]">
                  {step.refs.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-[9px] rounded-[9px] border px-[11px] py-[8px]"
                      style={{ borderColor: r.ok ? '#ECEEF1' : '#F2C9CA', background: r.ok ? '#FBFCFD' : '#FDF1F1' }}
                    >
                      <div className="flex min-w-0 items-center gap-[7px]">
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] font-semibold text-[#0E5AD6]">{r.srcLabel}</span>
                        <span className="whitespace-nowrap font-mono text-[11.5px] text-[#9AA1AC]">.{r.field}</span>
                      </div>
                      <ArrowRight size={14} style={{ color: '#C6CBD3', flex: 'none' }} />
                      <span
                        className="flex-none overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12.5px] font-bold"
                        style={{ maxWidth: 150, color: r.ok ? '#10905C' : '#CC3338' }}
                      >
                        {r.valueLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="mb-[9px] text-[11px] font-bold uppercase tracking-[.06em] text-[#A6ACB6]">Input</div>
            <pre className={`fmscroll ${JSON_BOX}`}>{step.input}</pre>

            <div className="mb-[9px] mt-[20px] text-[11px] font-bold uppercase tracking-[.06em] text-[#A6ACB6]">Output</div>
            <pre className={`fmscroll ${JSON_BOX}`} style={step.outputDim ? { color: '#B0B5BE' } : undefined}>{step.output}</pre>

            <div className="mb-[9px] mt-[20px] text-[11px] font-bold uppercase tracking-[.06em] text-[#A6ACB6]">Logs</div>
            <div className="flex flex-col overflow-hidden rounded-[10px] border border-[#ECEEF1]">
              {step.logs.map((lg, i) => (
                <div key={i} className="flex gap-[11px] border-b border-[#F2F3F5] px-[12px] py-[8px] font-mono text-[12px]" style={{ background: lg.bg }}>
                  <span className="flex-none text-[#B0B5BE]">{lg.t}</span>
                  <span style={lg.style}>{lg.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-[24px] text-center text-[#9AA1AC]">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#C6CBD3" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>
          <div className="mt-[14px] text-[14px] font-semibold text-[#6B7280]">Select a step</div>
          <div className="mt-[5px] max-w-[200px] text-[12.5px] leading-[1.5]">Click any node in the run to inspect its input, output and logs.</div>
        </div>
      )}
    </div>
  )
}
