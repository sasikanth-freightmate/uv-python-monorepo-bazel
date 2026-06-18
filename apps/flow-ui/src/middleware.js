import { NextResponse } from 'next/server'

// Server-side route gate. The session token is an httpOnly cookie, which
// middleware (unlike client JS) can read — so we redirect unauthenticated
// requests to /login before any page renders (no client-side flash).
//
// This is a presence check only; it can't verify the JWT (no secret at the
// edge). An expired-but-present cookie passes here, the backend then returns
// 401, and apiFetch (lib/api.js) bounces the user to /login.
const COOKIE = 'fm_flow_token'

export function middleware(req) {
  const authed = req.cookies.has(COOKIE)
  const { pathname } = req.nextUrl

  if (!authed && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (authed && pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.url))
  }
  return NextResponse.next()
}

export const config = {
  // Exclude api/* (the cookieless login POST must reach the proxy) and static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
