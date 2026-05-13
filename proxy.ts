import { auth0 } from './lib/auth0'

export function proxy(request: Request) {
  const { pathname } = new URL(request.url)
  // Auth routes are handled by app/auth/[auth0]/route.ts in Node.js runtime
  if (pathname.startsWith('/auth/') || pathname.startsWith('/api/auth/')) return
  return auth0.middleware(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt (metadata)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
