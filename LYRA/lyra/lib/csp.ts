// Single source of truth for the app's Content-Security-Policy, used by both
// middleware.ts (dynamic, per-request nonce) and next.config.ts (static fallback for
// the handful of paths middleware.ts's matcher excludes: _next/static, _next/image,
// favicon.ico, brand -- none of which serve HTML, but keeping one real CSP definition
// in sync is safer than hand-duplicating it in both places).
//
// Deliberately no 'strict-dynamic': this app sits behind Cloudflare (via Netlify's
// edge), which injects its own Web Analytics beacon (static.cloudflareinsights.com) as
// a plain <script> tag with no nonce, and the live Google Tag Manager container (a
// separate GTM account, not visible in this codebase) can add further tags at runtime.
// 'strict-dynamic' disables host-based allowlisting entirely, so any such script --
// ours or a third party's -- breaks silently with no build-time signal. That's what
// caused the 2026-08-16 production incident (reverted in PR #37). A nonce alongside a
// plain host allowlist keeps the same script-src hosts that have been working in
// production (googletagmanager.com, connect.facebook.net, js.stripe.com,
// cloudflareinsights.com) while still removing 'unsafe-inline' for the 4 genuinely
// inline scripts in app/layout.tsx (GTM bootstrap, GA4 init, Meta Pixel init, JSON-LD).
//
// img-src stays broad (https:) because post previews and avatars are fetched live from
// whichever platform CDN Zernio proxies (fbcdn, cdninstagram, licdn, ytimg, twimg, ...)
// across 9+ social platforms -- an exhaustive allowlist would silently break those and
// isn't derivable from this codebase (Zernio returns the URLs).
//
// connect-src is an explicit allowlist, not "https:", so an XSS can't exfiltrate data
// to an arbitrary host: api.stripe.com (Stripe.js tokenization calls), GTM + GA4,
// facebook.com (Meta Pixel's /tr tracking beacon), and cloudflareinsights.com (the
// beacon script's own reporting endpoint).
export function buildCsp(nonce?: string): string {
  const scriptSrc = nonce
    ? `'self' 'nonce-${nonce}' https://www.googletagmanager.com https://connect.facebook.net https://js.stripe.com https://static.cloudflareinsights.com`
    : `'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://js.stripe.com https://static.cloudflareinsights.com`

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://www.facebook.com https://static.cloudflareinsights.com",
    "frame-src 'self' https://js.stripe.com https://www.googletagmanager.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}
