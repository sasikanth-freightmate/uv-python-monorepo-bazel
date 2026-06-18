// Low-level API client for the same-origin /api/v1 proxy (next.config.js).
//
// The session token is an httpOnly cookie the browser attaches automatically, so
// this never sets an Authorization header. It does attach the active org as the
// X-Org-Id header (the backend requires it on tenant-scoped endpoints), and it
// bounces to /login on 401 so an expired/invalid session can't silently hang.

const ORG_COOKIE = 'fm_flow_org'
const ORG_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

// The active org id is non-sensitive (just which workspace is selected), so it
// lives in a normal readable cookie rather than the httpOnly session cookie.
export function getActiveOrg() {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)fm_flow_org=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

export function setActiveOrg(orgId) {
  if (typeof document === 'undefined') return
  document.cookie = `${ORG_COOKIE}=${encodeURIComponent(orgId)}; path=/; max-age=${ORG_MAX_AGE}; samesite=lax`
}

export function clearActiveOrg() {
  if (typeof document === 'undefined') return
  document.cookie = `${ORG_COOKIE}=; path=/; max-age=0`
}

export class ApiError extends Error {
  constructor(code, status) {
    super(code || `request_failed_${status}`)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export async function apiFetch(path, opts = {}) {
  const org = getActiveOrg()
  let res
  try {
    res = await fetch(`/api/v1${path}`, {
      ...opts,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(org ? { 'X-Org-Id': org } : {}),
        ...opts.headers,
      },
    })
  } catch {
    throw new ApiError('network_error', 0)
  }
  if (res.status === 401) {
    clearActiveOrg()
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new ApiError('unauthenticated', 401)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.code, res.status)
  }
  return res.status === 204 ? null : res.json()
}
