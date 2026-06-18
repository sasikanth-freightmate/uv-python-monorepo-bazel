import BrandPanel from './BrandPanel.jsx'
import LoginForm from './LoginForm.jsx'

// Responsive login shell: split (brand panel + form) on `lg+`, centered form
// with a compact logo below it. No layout prop — the breakpoint decides.
export default function LoginScreen() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas">
      <BrandPanel />

      <div className="flex h-full min-w-0 flex-1 items-center justify-center overflow-y-auto p-[32px]">
        <div className="w-full max-w-[380px]">
          {/* compact logo — only when the brand panel is hidden */}
          <div className="mb-[34px] flex items-center gap-[11px] lg:hidden">
            <div
              className="flex h-[36px] w-[36px] flex-none items-center justify-center rounded-[10px]"
              style={{ background: 'linear-gradient(135deg,#6E7BF2,#0E6EFF)' }}
            >
              <div className="h-[15px] w-[15px] rounded-[4px] bg-white" />
            </div>
            <span className="text-[17px] font-bold tracking-[-.01em]">FreightMate</span>
          </div>

          <h2 className="m-0 mb-[7px] text-[25px] font-bold tracking-[-.02em]">Sign in to FM Flow</h2>
          <p className="m-0 mb-[28px] text-[14.5px] text-[#6B7280]">
            Welcome back. Enter your details to continue.
          </p>

          <LoginForm />
        </div>
      </div>
    </div>
  )
}
