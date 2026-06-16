'use client'
import { IconChip } from '../ui/card.jsx'
import { Button } from '../ui/button.jsx'
import { Select } from '../ui/select.jsx'
import { Icon } from '../lib/icons.jsx'
import { Alert, X, Copy, Lock, Trash } from '../lib/glyphs.jsx'
import { TokenField } from './TokenField.jsx'

const JSON_BOX =
  'm-0 overflow-x-auto whitespace-pre rounded-[10px] border border-[#ECEEF1] bg-[#FAFAFB] px-[13px] py-[12px] font-mono text-[12.5px] leading-[1.6] text-[#3A4150]'

// Node configuration panel (spec §4). One slide-in container, contents adapt to
// the selected node's type. Settings tab (form) + Data tab (slug, outputs,
// samples). Fields flip between literal and reference (TokenField) editing.
export function ConfigPanel({ vm }) {
  const sel = vm.sel
  if (!sel) return null
  return (
    <div
      className="flex h-full w-[392px] min-h-0 flex-none flex-col border-l border-[#E6E8EC] bg-white"
      style={{ animation: 'fmrise .22s ease both' }}
    >
      {/* header */}
      <div className="px-[16px] pt-[16px]">
        <div className="flex items-start gap-[12px]">
          <IconChip bg={sel.catBg}><Icon kind={sel.kind} color={sel.catColor} size={21} /></IconChip>
          <div className="min-w-0 flex-1">
            <input
              value={sel.title}
              onChange={sel.onRename}
              spellCheck={false}
              className="-mx-[6px] -mt-[3px] w-[calc(100%+12px)] rounded-[7px] border border-transparent bg-transparent px-[6px] py-[3px] text-[16px] font-bold text-[#181B22] outline-none focus:border-[#E0E2E7] focus:bg-[#F4F5F7]"
            />
            <div className="mt-[3px] text-[12.5px] text-[#9AA1AC]">{sel.typeLabel}</div>
          </div>
          <button onClick={sel.onClose} className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[8px] text-[#9AA1AC] hover:bg-[#F4F5F7] hover:text-[#5C6470]">
            <X size={17} />
          </button>
        </div>
        <div className="mt-[16px] flex gap-[2px] border-b border-[#ECEEF1]">
          {sel.tabs.map((t) => (
            <button
              key={t.k}
              onClick={t.onClick}
              className="-mb-px cursor-pointer px-[13px] pb-[11px] pt-[9px] text-[13.5px] font-semibold"
              style={{ color: t.active ? '#0E6EFF' : '#8A919C', borderBottom: '2px solid ' + (t.active ? '#0E6EFF' : 'transparent') }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fmscroll min-h-0 flex-1 overflow-y-auto">
        {sel.tab === 'settings' && <SettingsTab sel={sel} onSaveConfig={vm.onSaveConfig} />}
        {sel.tab === 'data' && <DataTab sel={sel} />}
      </div>

      <div className="flex flex-none items-center gap-[10px] border-t border-[#ECEEF1] px-[16px] py-[12px]">
        <Button variant="danger" onClick={sel.onDelete}>
          <Trash size={15} />
          Delete
        </Button>
        <div className="flex-1" />
        <div className="font-mono text-[12px] text-[#B4B9C2]">{sel.idLabel}</div>
      </div>
    </div>
  )
}

function FieldEditor({ f }) {
  if (f.type === 'select') {
    return <Select value={f.value} onChange={f.onInput} options={f.options} />
  }
  return (
    <TokenField
      key={f.fieldKey}
      fieldKey={f.fieldKey}
      value={f.value}
      placeholder={f.placeholder}
      multiline={f.type === 'textarea'}
      vars={f.vars}
      slugMap={f.slugMap}
      onCommit={f.onCommit}
    />
  )
}

function SettingsTab({ sel, onSaveConfig }) {
  return (
    <div className="px-[16px] pb-[28px] pt-[18px]">
      {sel.needsSetup && (
        <div className="mb-[20px] flex gap-[10px] rounded-[11px] border border-[#F6E2B8] bg-[#FFF8EC] px-[13px] py-[12px]">
          <Alert size={17} style={{ color: '#E08600', flex: 'none', marginTop: 1 }} />
          <div className="text-[12.5px] leading-[1.45] text-[#946100]">
            This step needs to be configured before the workflow can run. Fill in the fields below.
          </div>
        </div>
      )}
      <div className="flex flex-col gap-[18px]">
        {sel.fields.map((f) => (
          <div key={f.key}>
            <div className="mb-[7px] flex items-center gap-[6px]">
              <label className="whitespace-nowrap text-[12.5px] font-semibold text-[#3A4150]">{f.label}</label>
              {f.required && <span className="text-[13px] text-[#E5484D]">*</span>}
            </div>
            <FieldEditor f={f} />
            {f.help && <div className="mt-[6px] text-[11.5px] leading-[1.4] text-[#9AA1AC]">{f.help}</div>}
          </div>
        ))}
      </div>
      {sel.needsSetup && (
        <Button variant="primary" className="mt-[22px] h-[42px] w-full" onClick={onSaveConfig}>
          Save configuration
        </Button>
      )}
    </div>
  )
}

function DataTab({ sel }) {
  return (
    <div className="px-[16px] pb-[28px] pt-[18px]">
      <div className="mb-[9px] text-[11px] font-bold uppercase tracking-[.06em] text-[#A6ACB6]">Reference slug</div>
      <div className="flex items-center gap-[9px] rounded-[10px] border border-[#ECEEF1] bg-[#F7F8FA] px-[11px] py-[9px]">
        <Lock size={14} style={{ color: '#9AA1AC', flex: 'none' }} />
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-semibold text-[#1B2029]">{sel.slug}</span>
        <button onClick={sel.onCopySlug} title="Copy slug" className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-[7px] border border-[#E0E2E7] bg-white text-[#5C6470] hover:bg-[#F4F5F7]">
          <Copy size={14} />
        </button>
      </div>
      <div className="mt-[7px] text-[11.5px] leading-[1.45] text-[#9AA1AC]">
        Immutable. Used in code &amp; references — it stays the same when you rename this step.
      </div>

      {sel.hasOutputs && (
        <>
          <div className="mb-[9px] mt-[22px] text-[11px] font-bold uppercase tracking-[.06em] text-[#A6ACB6]">Outputs other steps can reference</div>
          <div className="flex flex-col gap-[6px]">
            {sel.outputs.map((o) => (
              <div
                key={o.path}
                onClick={o.onCopy}
                title="Copy reference"
                className="flex cursor-pointer items-center gap-[9px] rounded-[9px] border border-[#ECEEF1] px-[11px] py-[8px] transition-colors hover:border-[#DCE6F5] hover:bg-[#F7F9FC]"
              >
                <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-[#0E5AD6]">{o.path}</span>
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-right text-[11.5px] text-[#9AA1AC]">{o.sample}</span>
                <Copy size={13} style={{ color: '#C6CBD3', flex: 'none' }} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mb-[9px] mt-[22px] text-[11px] font-bold uppercase tracking-[.06em] text-[#A6ACB6]">Sample input</div>
      <pre className={`fmscroll ${JSON_BOX}`}>{sel.sampleInput}</pre>
      <div className="mb-[9px] mt-[20px] text-[11px] font-bold uppercase tracking-[.06em] text-[#A6ACB6]">Sample output</div>
      <pre className={`fmscroll ${JSON_BOX}`}>{sel.sampleOutput}</pre>
    </div>
  )
}
