import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAllowedBearerRoute, isRestrictedBearerRoute } from './lib/mcp-bearer-allowlist'

// CSP nonce (script-src 'unsafe-inline' removal). Implemented 2026-08-14, replacing
// the "evaluated, not implemented" plan that lived here. Both risks the plan flagged
// were resolved deliberately, not just coded around:
//
// 1. Nonce-based CSP requires dynamic rendering on every page under the root layout.
//    app/legal/terms/page.tsx and app/legal/privacy/page.tsx were the only two pages
//    without a `dynamic` export -- both now have `export const dynamic = 'force-dynamic'`.
//    Accepted tradeoff: those two pages lose static generation. Low traffic, infrequent
//    content changes, not worth a parallel "skip the nonce on this one route" carve-out.
//
// 2. Two CSP headers would otherwise collide: this file now sets a per-request nonce
//    CSP for every path except the 4 file-serving prefixes middleware's matcher below
//    excludes (_next/static, _next/image, favicon.ico, brand) -- next.config.ts's static
//    `headers()` CSP entry was narrowed to serve ONLY those 4 excluded prefixes, so
//    nothing serves two Content-Security-Policy headers for the same response. Keep
//    these two definitions in sync by hand if the policy ever changes -- see the
//    buildCsp() comment below for why the policy string isn't just imported from
//    next.config.ts (that file isn't importable at the Edge runtime this file executes in).
//
// A third risk surfaced during implementation, not anticipated by the original plan:
// GTM's bootstrap snippet and the Meta Pixel init snippet both call
// `document.createElement('script')` to inject a SECOND script tag at runtime (loading
// gtm.js / fbevents.js). Under a nonce-only CSP with no `strict-dynamic`, a
// dynamically-inserted script has no nonce attribute and the browser silently blocks it
// -- GTM/GA/Meta Pixel would appear to work (no console error on load) but never
// actually fire. `'strict-dynamic'` is added to script-src specifically for this
// exact "a nonce-trusted script goes on to load more scripts" pattern (CSP Level 3) --
// browsers that support it trust anything a nonce-carrying script injects; browsers that
// don't fall back to the nonce + explicit host allowlist already in place. Verified live
// in a browser (Network tab + console, zero CSP violations) on the marketing home page,
// a legal page, and a logged-in dashboard page before this shipped -- see the PR
// description for the verification notes.
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.googletagmanager.com https://connect.facebook.net https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://www.facebook.com",
    "frame-src 'self' https://js.stripe.com https://www.googletagmanager.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

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

  // Every path reaching here (this file's matcher already excludes the 4 file-serving
  // prefixes next.config.ts's static CSP fallback covers instead) gets a fresh
  // per-request nonce -- API routes included, since a nonce CSP header on a JSON
  // response is inert but harmless, and branching around that isn't worth the
  // complexity. `crypto.randomUUID()` runs fine in the Edge runtime middleware executes in.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  // Pass the current pathname and nonce to server components via request headers
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
