'use client'
import { IconChip } from '../ui/card.jsx'
import { Icon } from '../lib/icons.jsx'
import { Search, Plus } from '../lib/glyphs.jsx'

// Left rail of the editor: searchable, categorised step palette. Items are
// click-to-add or drag-to-canvas.
export function PaletteSidebar({ vm }) {
  return (
    <div className="relative z-10 flex h-full w-[300px] min-h-0 flex-none flex-col border-r border-[#E6E8EC] bg-white">
      <div className="px-[18px] pb-[12px] pt-[18px]">
        <div className="mb-[3px] text-[13px] font-bold tracking-[.02em] text-[#181B22]">Add a step</div>
        <div className="text-[12.5px] leading-[1.4] text-[#8A919C]">{vm.hint}</div>
      </div>
      <div className="px-[18px] pb-[12px]">
        <div className="flex h-[38px] items-center gap-[9px] rounded-[9px] border border-[#ECEEF1] bg-[#F4F5F7] px-[11px]">
          <Search size={15} style={{ color: '#9AA1AC' }} />
          <input
            value={vm.query}
            onInput={vm.onSearch}
            placeholder="Search steps…"
            spellCheck={false}
            className="w-full border-none bg-transparent text-[13.5px] text-[#181B22] outline-none placeholder:text-[#9AA1AC]"
          />
        </div>
      </div>
      <div className="fmscroll min-h-0 flex-1 overflow-y-auto px-[12px] pb-[20px] pt-[4px]">
        {vm.groups.map((group) => (
          <div key={group.title} className="mb-[14px]">
            <div className="px-[6px] pb-[7px] pt-[6px] text-[11px] font-bold uppercase tracking-[.07em] text-[#A6ACB6]">{group.title}</div>
            <div className="flex flex-col gap-[5px]">
              {group.items.map((item) => (
                <div
                  key={item.type}
                  onClick={item.onAdd}
                  draggable
                  onDragStart={item.onDragStart}
                  className="flex cursor-pointer items-center gap-[11px] rounded-[10px] border border-transparent px-[10px] py-[9px] transition-colors hover:border-[#ECEEF1] hover:bg-[#F7F8FA]"
                >
                  <IconChip bg={item.bg} size={34} radius={9}><Icon kind={item.kind} color={item.color} size={17} /></IconChip>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold leading-[1.2] text-[#222831]">{item.label}</div>
                    <div className="mt-[1px] text-[12px] leading-[1.3] text-[#9AA1AC]">{item.desc}</div>
                  </div>
                  <Plus size={15} style={{ color: '#C6CBD3' }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
