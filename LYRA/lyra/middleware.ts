import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// --- CSP nonce (script-src 'unsafe-inline' removal) -- evaluated, NOT implemented ---
// next.config.ts's script-src currently needs 'unsafe-inline' for the 4 truly-inline
// <script>/dangerouslySetInnerHTML tags in app/layout.tsx (GTM bootstrap, GA4 init,
// Meta Pixel init, JSON-LD). Verified against Next.js 16.2 docs
// (nextjs.org/docs/app/guides/content-security-policy, fetched 2026-08-02) that a
// nonce CAN be plumbed through this file exactly like today's x-pathname pattern:
// generate `Buffer.from(crypto.randomUUID()).toString('base64')`, set it as BOTH a
// `x-nonce` request header (for Server Components to read via `(await headers()).get
// ('x-nonce')`) and the `Content-Security-Policy` response header (with
// `'nonce-${nonce}'` replacing 'unsafe-inline' in script-src), then thread `nonce={nonce}`
// onto every <Script>/<script> tag in app/layout.tsx.
//
// Not implemented here because of two risks that need a human decision + live-browser
// verification, not just a code read:
//  1. Next 16's nonce mechanism REQUIRES dynamic rendering on every page that renders
//     the nonce (root layout wraps the whole app). Docs state static generation, ISR,
//     and PPR are all incompatible with nonce-based CSP. app/page.tsx is already
//     `force-dynamic`, but app/legal/terms/page.tsx (and presumably legal/privacy) have
//     no dynamic export today and may currently be statically generated -- forcing them
//     dynamic is a rendering-strategy change with real perf/cost implications, not a
//     pure security tweak, and is outside this task's scope to decide unilaterally.
//  2. The nonce CSP header must be set here (in middleware/proxy) and next.config.ts's
//     static `headers()` CSP entry must then be removed for the routes this file's
//     matcher covers, or the browser receives two Content-Security-Policy headers whose
//     interaction (CSP header intersection semantics) is easy to get subtly wrong. This
//     file's matcher already excludes /api, _next/static, _next/image, favicon.ico, and
//     brand -- next.config.ts's headers() would need to keep serving a (non-nonce)
//     fallback CSP to exactly those excluded paths so they don't lose the header
//     entirely, which means keeping two CSP definitions in sync by hand.
// A nonce mismatch from either of these fails silently (no build error) and would
// break GTM/GA/Meta Pixel loading, or Stripe redirect analytics, in production with
// only a browser console CSP violation to reveal it. If this is picked up: implement
// per the plan above, then verify in a real browser (Network tab + console) on the
// marketing home page, a legal page, and a logged-in dashboard page before shipping.
// --------------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Pass the current pathname to server components via request headers
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|brand).*)'],
}
