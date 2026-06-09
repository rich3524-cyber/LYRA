import { auth0 } from '@/lib/auth0'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Public paths that never require authentication
const PUBLIC_PREFIXES = [
  '/auth/',
  '/api/auth/',
  '/api/health',
  '/onboard/',
]

const PUBLIC_EXACT = ['/', '/login', '/signup']

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  // Auth0 v4 middleware — handles session refresh and enforces auth
  const res = await auth0.middleware(req)
  return res
}

export const config = {
  // Run on all routes except static assets and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
