import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const response = NextResponse.next()

  // Expose pathname to server layouts via request headers
  response.headers.set('x-pathname', pathname)

  // Persist the last visited workspace so the sidebar falls back to the correct
  // workspace when navigating to non-workspace pages (e.g. /dashboard)
  const match = pathname.match(/^\/workspace\/([^/?]+)/)
  if (match) {
    response.cookies.set('lyra-active-workspace', match[1], {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|brand).*)'],
}
