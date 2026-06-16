'use client'
import { cn } from '../lib/utils.js'
import { Button } from '../ui/button.jsx'
import { Badge } from '../ui/badge.jsx'
import { Pause, Play, Save, Spinner, Versions } from '../lib/glyphs.jsx'

// Editor / run-detail top bar. Driven by the orchestrator's `vm`:
// { wfName, onRenameWf, statusLabel, isRun, paused, running,
//   onToggleView, onVersions, onPause, onSave, onRun }
export function WorkflowTopBar({ vm }) {
  const paused = vm.paused
  return (
    <div className="z-40 flex h-[60px] flex-none items-center gap-[16px] border-b border-[#E6E8EC] bg-white px-[18px]">
      <div className="flex min-w-0 items-center gap-[11px]">
        <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[8px] bg-[#0E1116]">
          <div className="h-[13px] w-[13px] rounded-[3px] bg-gradient-to-br from-[#6E7BF2] to-[#0E6EFF]" />
        </div>
        <div className="flex items-center gap-[7px] text-[14px] font-medium text-[#8A919C]">
          <span>Workflows</span>
          <span className="opacity-55">/</span>
        </div>
        <input
          value={vm.wfName}
          onChange={vm.onRenameWf}
          onFocus={(e) => e.target.select()}
          spellCheck={false}
          className="w-[230px] rounded-[7px] border border-transparent bg-transparent px-[8px] py-[5px] text-[15.5px] font-semibold text-[#181B22] outline-none focus:border-[#E0E2E7] focus:bg-[#F4F5F7]"
        />
        <Badge
          color={vm.isRun ? '#0E6EFF' : '#8A919C'}
          bg={vm.isRun ? '#EAF2FF' : '#F1F2F4'}
          className="ml-[2px] text-[12px] font-semibold"
        >
          {vm.isRun ? 'Viewing run' : 'Draft'}
        </Badge>
        <Badge
          dot
          dotColor={paused ? '#D7A53A' : '#22C277'}
          color={paused ? '#B07A00' : '#10905C'}
          bg={paused ? '#FCF1DD' : '#E3F6EC'}
          className="ml-[2px] text-[12px] font-semibold"
        >
          {paused ? 'Paused' : 'Active'}
        </Badge>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-[9px]">
        <Button
          variant={vm.isRun ? 'outline' : 'outline'}
          className={cn(vm.isRun && 'border-[#DCEAFF] bg-[#EAF2FF] text-[#0E6EFF] hover:bg-[#DCEAFF]')}
          onClick={vm.onToggleView}
        >
          {vm.isRun ? 'Back to editor' : 'Runs'}
        </Button>
        <Button variant="outline" onClick={vm.onVersions}>
          <Versions size={15} />
          v4 · draft
        </Button>
        <Button
          variant={paused ? 'outline' : 'outline'}
          className={cn(
            paused
              ? 'border-[#BFE6D2] bg-[#F2FBF6] text-[#10905C] hover:bg-[#E7F6EE]'
              : 'border-[#F0D9A8] bg-[#FFF9EC] text-[#B07A00] hover:bg-[#FBF1DC]',
          )}
          onClick={vm.onPause}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <div className="mx-[3px] h-[24px] w-px bg-[#E6E8EC]" />
        <Button variant="outline" onClick={vm.onSave}>
          <Save size={15} />
          Save
        </Button>
        <Button variant="primary" onClick={vm.onRun} disabled={vm.running}>
          {vm.running ? <Spinner size={15} /> : <Play size={15} />}
          {vm.running ? 'Running…' : 'Run'}
        </Button>
      </div>
    </div>
  )
}
