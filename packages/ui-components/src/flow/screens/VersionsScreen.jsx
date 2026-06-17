'use client'
import { Badge } from '../../ui/badge.jsx'
import { Button } from '../../ui/button.jsx'
import { Select } from '../../ui/select.jsx'
import { FlowCanvas } from '../rf/FlowCanvas.jsx'
import { ArrowRight, Restore, Check } from '../../lib/glyphs.jsx'

// Versions (timeline + visual diff + canary). The canvas reuses the editor's
// node geometry; pan/zoom/fit is managed locally so it stays read-only.
export function VersionsScreen({ vm }) {
  return (
    <div className="absolute inset-0 flex min-h-0 flex-col bg-[#F4F5F7]">
      {/* sub-header: tabs + contextual controls */}
      <div className="flex h-[56px] flex-none items-center gap-[14px] border-b border-[#E6E8EC] bg-white px-[24px]">
        <div className="flex items-center gap-[4px] rounded-[11px] bg-[#F1F2F4] p-[4px]">
          {vm.tabs.map((t) => (
            <button
              key={t.k}
              onClick={t.onClick}
              className="cursor-pointer rounded-[9px] px-[15px] py-[8px] text-[13.5px] font-semibold transition-colors"
              style={{ color: t.active ? '#fff' : '#5C6470', background: t.active ? '#0E6EFF' : 'transparent' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {vm.isCompare && (
          <div className="ml-[6px] flex items-center gap-[10px]">
            <Select value={vm.cmpA} onChange={vm.onCmpA} className="h-[36px] w-auto font-semibold">
              {vm.cmpOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <ArrowRight size={18} style={{ color: '#A6ACB6' }} />
            <Select value={vm.cmpB} onChange={vm.onCmpB} className="h-[36px] w-auto font-semibold">
              {vm.cmpOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
        )}

        <div className="flex-1" />

        {vm.isTimeline && vm.selectedRestorable && (
          <Button variant="outline" onClick={vm.onRestoreSelected}><Restore size={15} />Restore as draft</Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {vm.isTimeline && <TimelineRail vm={vm} />}
        {vm.isCanvas && <VersionCanvas vm={vm} />}
        {vm.isCanary && <CanaryPanel canary={vm.canary} />}
      </div>
    </div>
  )
}

function TimelineRail({ vm }) {
  return (
    <div className="fmscroll w-[360px] flex-none overflow-y-auto border-r border-[#E6E8EC] bg-white p-[16px]">
      <div className="flex flex-col gap-[10px]">
        {vm.verList.map((v) => (
          <div
            key={v.label}
            onClick={v.onSelect}
            className="relative flex cursor-pointer flex-col gap-[9px] rounded-[13px] border px-[15px] py-[14px] transition-colors hover:border-[#CBD8EC]"
            style={{ background: v.active ? '#F1F6FF' : '#fff', borderColor: v.active ? '#CBE0FF' : '#ECEEF1' }}
          >
            <div className="flex items-center gap-[9px]">
              <span className="font-mono text-[14px] font-bold text-[#181B22]">{v.label}</span>
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-semibold text-[#1B2029]">{v.name}</span>
              <Badge color={v.statusColor} bg={v.statusBg} className="flex-none text-[10.5px]">{v.statusLabel}</Badge>
            </div>
            <div className="text-[12.5px] leading-[1.5] text-[#7E8896]">{v.note}</div>
            <div className="flex items-center gap-[8px]">
              <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-[10.5px] font-bold text-white" style={{ background: v.avatarBg }}>{v.initials}</span>
              <span className="text-[12px] text-[#8A919C]">{v.author}</span>
              <span className="text-[12px] text-[#B0B5BE]">·</span>
              <span className="text-[12px] text-[#8A919C]">{v.when}</span>
              <span className="flex-1" />
              <span className="font-mono text-[11.5px] text-[#A6ACB6]">{v.stepsLabel}</span>
            </div>
            <div className="mt-[2px] flex items-center gap-[7px]">
              <button onClick={v.onView} className="h-[30px] rounded-[8px] border border-[#E0E2E7] bg-white px-[11px] text-[12.5px] font-semibold text-[#3A4150] hover:bg-[#F7F8FA]">View</button>
              <button onClick={v.onCompare} className="h-[30px] rounded-[8px] border border-[#E0E2E7] bg-white px-[11px] text-[12.5px] font-semibold text-[#3A4150] hover:bg-[#F7F8FA]">Compare</button>
              {v.canRestore && (
                <button onClick={v.onRestore} className="h-[30px] rounded-[8px] border border-[#E0E2E7] bg-white px-[11px] text-[12.5px] font-semibold text-[#3A4150] hover:bg-[#F7F8FA]">Restore</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function VersionCanvas({ vm }) {
  return (
    <div className="relative flex min-w-0 flex-1">
      <div className="relative flex-1 overflow-hidden bg-[#F4F5F7]">
        <FlowCanvas vm={vm.flow} />

        <div className="absolute left-[18px] top-[18px] z-10">
          <div className="flex items-center gap-[11px] rounded-[11px] border border-[#E6E8EC] bg-white px-[14px] py-[9px] shadow-[0_4px_14px_-8px_rgba(20,24,32,.2)]">
            <span className="h-[8px] w-[8px] flex-none rounded-full" style={{ background: bannerDot(vm.bannerTone) }} />
            <div>
              <div className="whitespace-nowrap text-[13.5px] font-bold text-[#1B2029]">{vm.bannerText}</div>
              <div className="mt-[1px] whitespace-nowrap text-[11.5px] text-[#8A919C]">{vm.bannerSub}</div>
            </div>
          </div>
        </div>
      </div>

      {vm.isCompare && <ChangePanel vm={vm} />}
    </div>
  )
}

function bannerDot(tone) {
  return tone === 'live' ? '#22C277' : tone === 'canary' ? '#0E6EFF' : tone === 'compare' ? '#6E7BF2' : '#C6CBD3'
}

function ChangePanel({ vm }) {
  const SIGN = {
    added: { c: '#10905C', bg: '#E3F6EC', sign: '+', label: 'Added' },
    removed: { c: '#CC3338', bg: '#FBE5E6', sign: '–', label: 'Removed' },
    changed: { c: '#B07A00', bg: '#FCF1DD', sign: '~', label: 'Changed' },
  }
  return (
    <div className="fmscroll w-[340px] flex-none overflow-y-auto border-l border-[#E6E8EC] bg-white px-[18px] py-[20px]">
      <div className="mb-[4px] text-[11px] font-bold uppercase tracking-[.06em] text-[#A6ACB6]">What changed</div>
      <div className="mb-[18px] text-[13px] text-[#5C6470]">{vm.cmpAName} → {vm.cmpBName}</div>
      {vm.hasChanges ? (
        <div className="flex flex-col gap-[10px]">
          {vm.changes.map((c, i) => {
            const p = SIGN[c.kind]
            return (
              <div key={i} className="flex items-start gap-[11px] rounded-[11px] border border-[#ECEEF1] bg-[#FBFCFD] px-[13px] py-[12px]">
                <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[7px] text-[13px] font-extrabold" style={{ background: p.bg, color: p.c }}>{p.sign}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[8px]">
                    <span className="text-[13.5px] font-semibold text-[#1B2029]">{c.title}</span>
                    <span className="rounded-[5px] px-[7px] py-[1px] text-[10.5px] font-bold" style={{ background: p.bg, color: p.c }}>{p.label}</span>
                  </div>
                  <div className="mt-[4px] font-mono text-[12px] leading-[1.5] text-[#7E8896]">{c.detail}</div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="px-[16px] py-[40px] text-center text-[#9AA1AC]">
          <div className="text-[14px] font-semibold text-[#6B7280]">No differences</div>
          <div className="mt-[4px] text-[12.5px] leading-[1.5]">These two versions have identical graphs.</div>
        </div>
      )}
    </div>
  )
}

function CanaryPanel({ canary }) {
  return (
    <div className="fmscroll min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[880px] px-[32px] pb-[64px] pt-[28px]">
        {/* experiment header */}
        <div className="mb-[18px] rounded-[16px] border border-[#E6E8EC] bg-white px-[24px] py-[22px]">
          <div className="mb-[6px] flex items-center gap-[12px]">
            <div className="whitespace-nowrap text-[18px] font-bold text-[#181B22]">Canary experiment</div>
            <Badge color={canary.headColor} bg={canary.headBg} className="text-[11.5px]" dot={canary.state === 'running'} dotColor={canary.headColor}>{canary.headLabel}</Badge>
          </div>
          <div className="max-w-[560px] text-[13.5px] leading-[1.5] text-[#7E8896]">
            Routing a slice of live traffic to the <b className="text-[#0E6EFF]">v4 canary</b> and comparing it against the <b className="text-[#10905C]">v3 live</b> version in real time.
          </div>

          {/* traffic split */}
          <div className="mt-[22px]">
            <div className="mb-[9px] flex items-center justify-between">
              <div className="flex items-center gap-[8px]">
                <span className="h-[9px] w-[9px] flex-none rounded-full bg-[#10905C]" />
                <span className="whitespace-nowrap text-[13px] font-semibold text-[#3A4150]">v3 live</span>
                <span className="font-mono text-[13px] font-bold tabular-nums text-[#10905C]">{canary.liveSplit}%</span>
              </div>
              <div className="flex items-center gap-[8px]">
                <span className="font-mono text-[13px] font-bold tabular-nums text-[#0E6EFF]">{canary.split}%</span>
                <span className="whitespace-nowrap text-[13px] font-semibold text-[#3A4150]">v4 canary</span>
                <span className="h-[9px] w-[9px] flex-none rounded-full bg-[#0E6EFF]" />
              </div>
            </div>
            <div className="flex h-[14px] overflow-hidden rounded-[8px] bg-[#EEF0F3]">
              <div style={{ width: `${canary.liveSplit}%`, background: '#CBCFD6', transition: 'width .2s' }} />
              <div style={{ width: `${canary.split}%`, background: 'linear-gradient(90deg,#0E6EFF,#6E7BF2)', transition: 'width .2s' }} />
            </div>
            <div className="mt-[14px] flex items-center gap-[12px]">
              <span className="whitespace-nowrap text-[12px] font-semibold text-[#8A919C]">Canary traffic</span>
              <input
                type="range"
                className="vrange"
                min="5"
                max="50"
                step="5"
                value={canary.split}
                onInput={canary.onSplit}
                onChange={canary.onSplit}
                style={{ flex: 1, background: `linear-gradient(90deg,#0E6EFF 0%,#0E6EFF ${Math.round(((canary.split - 5) / 45) * 100)}%,#E1E5EA ${Math.round(((canary.split - 5) / 45) * 100)}%,#E1E5EA 100%)` }}
              />
              <span className="w-[38px] text-right font-mono text-[12.5px] font-bold tabular-nums text-[#0E6EFF]">{canary.split}%</span>
            </div>
          </div>
        </div>

        {/* metrics */}
        <div className="mx-[2px] mb-[12px] mt-[4px] text-[11px] font-bold uppercase tracking-[.06em] text-[#A6ACB6]">Live comparison · {canary.sampleLabel}</div>
        <div className="mb-[20px] grid grid-cols-2 gap-[14px]">
          {canary.metrics.map((m) => (
            <div key={m.label} className="rounded-[14px] border border-[#E6E8EC] bg-white px-[18px] py-[16px]">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#5C6470]">{m.label}</span>
                <span className="rounded-[6px] bg-[#E3F6EC] px-[8px] py-[2px] text-[12px] font-bold text-[#10905C]">{m.delta}</span>
              </div>
              <div className="mt-[14px] flex items-end gap-[24px]">
                <div>
                  <div className="mb-[4px] text-[10.5px] font-bold uppercase tracking-[.04em] text-[#A6ACB6]">v3 live</div>
                  <div className="font-mono text-[21px] font-bold tabular-nums text-[#181B22]">{m.live}</div>
                </div>
                <ArrowRight size={18} style={{ color: '#C6CBD3', marginBottom: 6 }} />
                <div>
                  <div className="mb-[4px] text-[10.5px] font-bold uppercase tracking-[.04em] text-[#0E6EFF]">v4 canary</div>
                  <div className="font-mono text-[21px] font-bold tabular-nums text-[#10905C]">{m.cand}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* verdict / actions */}
        {canary.state === 'running' && (
          <div className="flex items-center gap-[16px] rounded-[14px] border border-[#BFE6D2] bg-[#F2FBF6] px-[20px] py-[18px]">
            <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[12px] bg-[#E3F6EC]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10905C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-[#11623F]">v4 is outperforming v3</div>
              <div className="mt-[2px] text-[13px] text-[#3F7A5C]">Higher success rate and faster average runs at 95% confidence. Safe to promote.</div>
            </div>
            <div className="flex flex-none items-center gap-[10px]">
              <Button variant="outline" size="lg" onClick={canary.onRollback}>Roll back to v3</Button>
              <Button variant="success" size="lg" onClick={canary.onPromote}><Check size={15} />Promote v4 to 100%</Button>
            </div>
          </div>
        )}
        {canary.state === 'promoted' && (
          <VerdictCard color="#11623F" sub="#3F7A5C" border="#BFE6D2" iconBg="#E3F6EC" title="v4 promoted to live" desc="v4 now serves 100% of traffic. v3 has been archived." onReset={canary.onReset}>
            <Check size={22} style={{ color: '#10905C' }} />
          </VerdictCard>
        )}
        {canary.state === 'rolledback' && (
          <VerdictCard color="#8A6300" sub="#9A7320" border="#F0D9A8" iconBg="#FCF1DD" title="Canary rolled back" desc="All traffic returned to v3 live. v4 remains an editable draft." onReset={canary.onReset}>
            <Restore size={22} style={{ color: '#B07A00' }} />
          </VerdictCard>
        )}
      </div>
    </div>
  )
}

function VerdictCard({ color, sub, border, iconBg, title, desc, onReset, children }) {
  return (
    <div className="flex items-center gap-[16px] rounded-[14px] border bg-white px-[20px] py-[18px]" style={{ borderColor: border }}>
      <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[12px]" style={{ background: iconBg }}>{children}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold" style={{ color }}>{title}</div>
        <div className="mt-[2px] text-[13px]" style={{ color: sub }}>{desc}</div>
      </div>
      <Button variant="outline" className="flex-none" onClick={onReset}>Restart experiment</Button>
    </div>
  )
}
