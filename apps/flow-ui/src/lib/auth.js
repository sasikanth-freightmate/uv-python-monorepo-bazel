// Client-side auth helpers. Calls go to the same-origin /api/v1 proxy defined in
// next.config.js. The session token is an httpOnly cookie set by the backend on
// login — JS never reads or stores it; we only track the active org client-side
// (see lib/api.js). Route gating is handled server-side by middleware.js.

import { apiFetch, clearActiveOrg, getActiveOrg, setActiveOrg } from './api.js'

export { getActiveOrg, setActiveOrg }

// Backend error `code`s (see api/exception_handlers.py) → human messages.
const LOGIN_ERRORS = {
  unauthenticated: 'Invalid email or password.',
  service_unavailable: 'The service is temporarily unavailable. Please try again.',
}

/**
 * Exchange email/password for a session. On success the backend sets the
 * httpOnly `fm_flow_token` cookie; the response body token is ignored here.
 * @throws {Error} with a human-readable message when the credentials are rejected.
 */
export async function login(email, password) {
  let res
  try {
    res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'same-origin',
    })
  } catch {
    throw new Error('Could not reach the server. Please try again.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(LOGIN_ERRORS[body.code] ?? 'Invalid email or password.')
  }
  return res.json()
}

/** Identity + workspaces for the signed-in user: { user, memberships[] }. */
export function fetchMe() {
  return apiFetch('/auth/me')
}

/** Clear the server cookie + active org and return to /login. */
export async function logout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
  } catch {
    // Clear client state regardless of the network result.
  }
  clearActiveOrg()
  if (typeof window !== 'undefined') window.location.href = '/login'
}
