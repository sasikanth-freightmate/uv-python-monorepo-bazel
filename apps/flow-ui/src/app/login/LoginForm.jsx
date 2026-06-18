'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, cn } from '@fm-flow/ui-components'
import { fetchMe, login, setActiveOrg } from '../../lib/auth.js'

// Eye / eye-off icons for the password reveal toggle (matches the design prototype).
function EyeIcon({ off }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
  return off ? (
    <svg {...common}>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  ) : (
    <svg {...common}>
      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      await login(email, password) // backend sets the httpOnly session cookie
      const me = await fetchMe()
      if (!me.memberships?.length) {
        setError('Your account has no workspace yet. Ask an admin for access.')
        setSubmitting(false)
        return
      }
      setActiveOrg(me.memberships[0].org_id)
      router.push('/')
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  const noop = (e) => e.preventDefault()

  return (
    <form onSubmit={onSubmit} noValidate>
      {/* email */}
      <div className="mb-[16px]">
        <label className="mb-[7px] block text-[13px] font-semibold text-[#374151]">Work email</label>
        <Input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="h-[44px] rounded-[10px] text-[14.5px]"
        />
      </div>

      {/* password */}
      <div className="mb-[14px]">
        <div className="mb-[7px] flex items-center justify-between">
          <label className="text-[13px] font-semibold text-[#374151]">Password</label>
          <a href="#" onClick={noop} className="text-[12.5px] font-semibold text-signal no-underline">
            Forgot?
          </a>
        </div>
        <div className="relative">
          <Input
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-[44px] rounded-[10px] pr-[44px] text-[14.5px]"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            title={showPw ? 'Hide password' : 'Show password'}
            className="absolute right-[6px] top-[6px] flex h-[32px] w-[32px] items-center justify-center rounded-[7px] border-none bg-transparent text-[#8A919C] transition-colors hover:bg-[#F1F2F4] hover:text-[#5C6470]"
          >
            <EyeIcon off={showPw} />
          </button>
        </div>
      </div>

      {/* keep me signed in */}
      <label className="mb-[22px] flex cursor-pointer select-none items-center gap-[9px]">
        <span
          onClick={() => setRemember((v) => !v)}
          className={cn(
            'flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border-[1.5px] transition-all',
            remember ? 'border-signal bg-signal' : 'border-[#C7CBD2] bg-white',
          )}
        >
          {remember && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </span>
        <span onClick={() => setRemember((v) => !v)} className="text-[13.5px] text-[#4B5563]">
          Keep me signed in
        </span>
      </label>

      {/* error */}
      {error && <p className="m-0 mb-[14px] text-[13px] font-medium text-error">{error}</p>}

      {/* submit */}
      <Button
        type="submit"
        variant="primary"
        disabled={submitting}
        className="h-[46px] w-full gap-[9px] rounded-[10px] border-none bg-[linear-gradient(135deg,#0E6EFF,#3D5CFF)] text-[15px] text-white shadow-[0_6px_18px_-8px_rgba(14,110,255,.7)] hover:brightness-[1.06] disabled:opacity-80"
      >
        {submitting ? (
          <>
            <span
              className="inline-block h-[15px] w-[15px] rounded-full border-2 border-white/40 border-t-white"
              style={{ animation: 'fmspin .7s linear infinite' }}
            />
            Signing in…
          </>
        ) : (
          'Sign in'
        )}
      </Button>

      <p className="m-0 mt-[24px] text-center text-[13.5px] text-[#6B7280]">
        Don&apos;t have an account?{' '}
        <a href="#" onClick={noop} className="font-semibold text-signal no-underline">
          Request access
        </a>
      </p>
    </form>
  )
}
