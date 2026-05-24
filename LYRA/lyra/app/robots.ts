import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/thank-you'],
        disallow: ['/dashboard', '/agency', '/account', '/api/', '/workspace/'],
      },
    ],
    sitemap: 'https://lyraonline.ai/sitemap.xml',
  }
}
