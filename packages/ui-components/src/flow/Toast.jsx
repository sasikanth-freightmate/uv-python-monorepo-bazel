'use client'
import { Check } from '../lib/glyphs.jsx'

// Transient confirmation toast, bottom-centered.
export function Toast({ text }) {
  if (!text) return null
  return (
    <div
      className="fixed bottom-[26px] left-1/2 z-[200] flex -translate-x-1/2 items-center gap-[9px] rounded-[11px] bg-[#0E1116] px-[15px] py-[11px] text-[13px] font-semibold text-white shadow-[0_16px_40px_-12px_rgba(20,24,32,.5)]"
      style={{ animation: 'fmtoast .25s ease both' }}
    >
      <Check size={16} style={{ color: '#5BE3A0' }} />
      {text}
    </div>
  )
}
