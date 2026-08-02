import type { NextConfig } from "next";
import path from "path";

// script-src/frame-src allow GTM, Meta Pixel, and Stripe.js -- the GTM bootstrap,
// GA4 init, and Meta Pixel init snippets in app/layout.tsx are truly inline
// (dangerouslySetInnerHTML, no src attribute), hence 'unsafe-inline' (no nonce
// plumbing exists yet). js.stripe.com is allowlisted for Stripe.js/Elements even
// though today's billing flow only redirects to Stripe-hosted Checkout via
// /api/stripe/create-checkout -- @stripe/stripe-js is a declared dependency and
// this keeps the CSP consistent if client-side Elements are wired in later.
// img-src stays broad (https:) because post previews and avatars are fetched live
// from whichever platform CDN Zernio proxies (fbcdn, cdninstagram, licdn, ytimg,
// twimg, ...) across 9+ social platforms -- an exhaustive allowlist would silently
// break those and isn't derivable from this codebase (Zernio returns the URLs).
// connect-src is an explicit allowlist, not "https:", so an XSS can't exfiltrate
// data to an arbitrary host: api.stripe.com (Stripe.js tokenization calls, see
// js.stripe.com note above), googletagmanager.com + google-analytics.com (GTM
// container runtime + GA4 gtag.js measurement hits -- GA_ID is configured
// directly via gtag(), not only through the GTM container), and facebook.com
// (Meta Pixel's /tr tracking beacon -- confirmed by the noscript <img> fallback
// below, which hits the same https://www.facebook.com/tr endpoint).
const CSP = [
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
    // never a third-party URL, so this narrow pattern is enough for them.
    remotePatterns: [
      { protocol: 'https', hostname: '*.s3.*.amazonaws.com' },
    ],
  },
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
