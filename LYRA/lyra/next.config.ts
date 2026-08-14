import type { NextConfig } from "next";
import path from "path";

// This is now ONLY a fallback CSP for the 4 static/file-serving prefixes
// middleware.ts's matcher excludes (_next/static, _next/image, favicon.ico, brand) --
// every other path gets a per-request nonce-based CSP set by middleware.ts instead
// (see buildCsp() there), which next.config.ts can't build directly since this file
// runs in the Node build/config context, not the Edge runtime middleware executes in,
// and has no access to a per-request nonce anyway. Kept in sync BY HAND with
// middleware.ts's buildCsp() policy (same directives, minus the nonce/strict-dynamic
// on script-src) -- these 4 paths serve static assets and one image-generation route
// (app/brand/slack-avatar), none of which render the inline scripts in app/layout.tsx,
// so 'unsafe-inline' here is inert in practice, not a real gap.
//
// script-src/frame-src allow GTM, Meta Pixel, and Stripe.js. js.stripe.com is
// allowlisted for Stripe.js/Elements even though today's billing flow only redirects
// to Stripe-hosted Checkout via /api/stripe/create-checkout -- @stripe/stripe-js is a
// declared dependency and this keeps the CSP consistent if client-side Elements are
// wired in later. img-src stays broad (https:) because post previews and avatars are
// fetched live from whichever platform CDN Zernio proxies (fbcdn, cdninstagram, licdn,
// ytimg, twimg, ...) across 9+ social platforms -- an exhaustive allowlist would
// silently break those and isn't derivable from this codebase (Zernio returns the
// URLs). connect-src is an explicit allowlist, not "https:", so an XSS can't
// exfiltrate data to an arbitrary host: api.stripe.com (Stripe.js tokenization calls,
// see js.stripe.com note above), googletagmanager.com + google-analytics.com (GTM
// container runtime + GA4 gtag.js measurement hits -- GA_ID is configured directly via
// gtag(), not only through the GTM container), and facebook.com (Meta Pixel's /tr
// tracking beacon -- confirmed by the noscript <img> fallback in app/layout.tsx, which
// hits the same https://www.facebook.com/tr endpoint).
const STATIC_FALLBACK_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://js.stripe.com",
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
        // Content-Security-Policy deliberately excluded here -- middleware.ts sets a
        // per-request nonce-based one on every path this block also covers. Keeping
        // both would send two CSP headers on the same response, which browsers combine
        // via header intersection (each directive becomes the STRICTEST of the two) --
        // easy to get subtly wrong and not something to rely on. See middleware.ts's
        // buildCsp() for the real policy.
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
        // The 4 prefixes middleware.ts's matcher excludes from nonce-CSP handling --
        // these get the static fallback policy instead, so they don't lose the
        // Content-Security-Policy header entirely. See STATIC_FALLBACK_CSP's comment.
        source: '/_next/static/:path*',
        headers: [{ key: 'Content-Security-Policy', value: STATIC_FALLBACK_CSP }],
      },
      {
        source: '/_next/image',
        headers: [{ key: 'Content-Security-Policy', value: STATIC_FALLBACK_CSP }],
      },
      {
        source: '/favicon.ico',
        headers: [{ key: 'Content-Security-Policy', value: STATIC_FALLBACK_CSP }],
      },
      {
        source: '/brand/:path*',
        headers: [{ key: 'Content-Security-Policy', value: STATIC_FALLBACK_CSP }],
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
