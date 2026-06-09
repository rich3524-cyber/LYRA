import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Frame-Options',        value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
  {
    key:   'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key:   'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // unsafe-eval needed by Next.js dev
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.auth0.com https://api.stripe.com",
      "frame-src 'self' https://js.stripe.com https://*.auth0.com",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.fbcdn.net' },         // Facebook/Instagram avatars
      { protocol: 'https', hostname: '**.cdninstagram.com' },  // Instagram CDN
      { protocol: 'https', hostname: 'pbs.twimg.com' },        // Twitter avatars
      { protocol: 'https', hostname: 'media.licdn.com' },      // LinkedIn avatars
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }, // Google avatars
      { protocol: 'https', hostname: 's.gravatar.com' },       // Auth0 fallback
      { protocol: 'https', hostname: '**.s3.amazonaws.com' },  // S3 uploads
      { protocol: 'https', hostname: '**.s3.ap-southeast-2.amazonaws.com' },
    ],
  },
};

export default nextConfig;
