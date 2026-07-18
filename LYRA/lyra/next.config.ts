import type { NextConfig } from "next";

// script-src/frame-src allow GTM, Meta Pixel, and Stripe.js -- all loaded via inline
// snippets in app/layout.tsx, hence 'unsafe-inline' (no nonce plumbing exists yet).
// img-src/connect-src stay broad (https:) because post previews and avatars are
// fetched live from whichever platform CDN Zernio proxies (fbcdn, cdninstagram,
// licdn, ytimg, twimg, ...) and an exhaustive allowlist would silently break those.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-src 'self' https://js.stripe.com https://www.googletagmanager.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: CSP },
        ],
      },
      {
        // Prevent Netlify CDN from caching any authenticated dashboard pages
        source: '/(workspace|agency|account|dashboard|help|legal)/:path*',
        headers: [
          { key: 'Surrogate-Control', value: 'no-store' },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
        ],
      },
    ]
  },
};

export default nextConfig;
