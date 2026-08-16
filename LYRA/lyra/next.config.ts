import type { NextConfig } from "next";
import path from "path";
import { buildCsp } from "./lib/csp";

// Fallback CSP (no nonce -- 'unsafe-inline') for the handful of paths middleware.ts's
// matcher excludes (_next/static, _next/image, favicon.ico, brand). None of those
// serve HTML so 'unsafe-inline' never actually permits anything there, but every
// response needs SOME Content-Security-Policy header. Every route middleware.ts
// covers gets the real nonce-based CSP from there instead -- see lib/csp.ts for the
// full policy and why 'strict-dynamic' is deliberately not used.
const CSP = buildCsp()

const nextConfig: NextConfig = {
  // Stray package-lock.json files elsewhere in this OneDrive folder (at the
  // Windows user profile root and the git root above this project) made
  // Turbopack guess the workspace root two levels too high, which produced a
  // broken Windows-path string embedded in the deployed serverless function
  // bundle (a real production outage on 2026-07-20 -- ERR_MODULE_NOT_FOUND
  // crashing every request). Pinning the root explicitly removes the guess.
  turbopack: {
    root: __dirname,
  },
  images: {
    // Composer/schedule-review media thumbnails are next/image now instead of raw
    // <img> -- their src is always our own upload bucket (media/{workspaceId}/...),
    // never a third-party URL. Pinned to the actual bucket/region, not a
    // wildcard -- `*.s3.*.amazonaws.com` let /_next/image proxy and cache any
    // attacker-owned bucket in any region, not just ours.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: `${process.env.AWS_S3_BUCKET}.s3.${process.env.S3_REGION ?? 'ap-southeast-2'}.amazonaws.com`,
      },
    ],
  },
  async headers() {
    return [
      {
        // CSP excluded here -- middleware.ts sets the real nonce-based CSP on every
        // path except the ones matched below, which never reach middleware.ts at all.
        // Setting it here too (unscoped) would add a second Content-Security-Policy
        // header on every other response; browsers intersect multiple CSP headers
        // per-directive, so a script would then need to satisfy BOTH the nonce policy
        // and this unsafe-inline one simultaneously -- easy to get subtly wrong.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // No window.open/window.opener usage anywhere in the app (verified) --
          // safe to isolate the browsing context group without risking a
          // popup-based OAuth/payment flow.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      {
        // Mirrors middleware.ts's matcher exclusions exactly -- these paths never run
        // middleware.ts, so they'd otherwise ship with no CSP header at all.
        source: '/(_next/static|_next/image|brand)/:path*',
        headers: [{ key: 'Content-Security-Policy', value: CSP }],
      },
      {
        source: '/favicon.ico',
        headers: [{ key: 'Content-Security-Policy', value: CSP }],
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
