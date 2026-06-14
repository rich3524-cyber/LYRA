import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
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
