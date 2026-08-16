import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAllowedBearerRoute, isRestrictedBearerRoute } from './lib/mcp-bearer-allowlist'
import { buildCsp } from './lib/csp'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // A bearer token authenticates as a specific user with no route restriction of its
  // own (see getUserFromBearerToken in lib/auth.ts) -- without this, an MCP OAuth token
  // scoped for the gateway's own tool surface would work as a full-privilege API key
  // against every route in the app. Reject it here, before any route handler runs, if
  // it's presented outside the exact set of routes the gateway actually calls.
  if (isRestrictedBearerRoute(pathname)) {
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ') && !isAllowedBearerRoute(request.method, pathname)) {
      return NextResponse.json({ error: 'Bearer-token authentication is not accepted on this route.' }, { status: 403 })
    }
    return NextResponse.next()
  }

  // A fresh nonce per request replaces next.config.ts's static 'unsafe-inline' CSP for
  // every route this middleware covers -- see lib/csp.ts for why 'strict-dynamic' is
  // deliberately not used.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', buildCsp(nonce))
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|brand).*)'],
}
