// Left-hand brand panel for the login screen — the FreightMate spectrum
// gradient with a floating blurred orb, headline, and trust badges. Hidden
// below the `lg` breakpoint (the form panel centers itself instead).

export default function BrandPanel() {
  return (
    <div className="relative hidden h-full w-[46%] max-w-[620px] flex-none overflow-hidden lg:block">
      {/* spectrum gradient + dark radial overlays */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(150deg,#FFE3D3 0%,#FCABD8 32%,#D6B1F6 64%,#6E7BF2 100%)' }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 85% 0%,rgba(0,0,41,.42),transparent 55%),radial-gradient(90% 80% at 0% 100%,rgba(0,0,41,.34),transparent 60%)',
        }}
      />
      {/* floating blurred orb */}
      <div
        className="absolute h-[340px] w-[340px] rounded-full"
        style={{
          right: -90,
          top: -70,
          background: 'rgba(255,255,255,.14)',
          filter: 'blur(8px)',
          animation: 'fmfloat 9s ease-in-out infinite',
        }}
      />

      <div className="relative z-[2] flex h-full flex-col px-[52px] py-[46px]">
        {/* logo lockup */}
        <div className="flex items-center gap-[12px]">
          <div
            className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] border border-white/40"
            style={{ background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(6px)' }}
          >
            <div className="h-[16px] w-[16px] rounded-[5px] bg-white" />
          </div>
          <span className="text-[18px] font-bold tracking-[-.01em] text-white">FreightMate</span>
        </div>

        {/* headline block */}
        <div className="flex max-w-[430px] flex-1 flex-col justify-center">
          <div className="mb-[20px] font-mono text-[12px] font-medium uppercase tracking-[.16em] text-white/80">
            FM&nbsp;Flow
          </div>
          <h1 className="m-0 mb-[18px] text-[40px] font-bold leading-[1.1] tracking-[-.02em] text-white text-balance">
            Automate the busywork behind every shipment.
          </h1>
          <p className="m-0 text-[16px] leading-[1.55] text-white/[.88]">
            Build, version, and run freight workflows that connect your TMS, carriers, and back
            office — without writing glue code.
          </p>
        </div>

        {/* trust badges */}
        <div className="flex gap-[26px] font-mono text-[12.5px] text-white/[.78]">
          <span>SOC 2 Type II</span>
          <span>99.98% uptime</span>
          <span>EU + US regions</span>
        </div>
      </div>
    </div>
  )
}
