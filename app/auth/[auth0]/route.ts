import { auth0 } from '@/lib/auth0'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const isCallback = url.pathname.includes('/callback')

  // Diagnostic: log what we receive at the callback
  if (isCallback) {
    const cookieHeader = request.headers.get('cookie') ?? '(none)'
    const stateParam  = url.searchParams.get('state') ?? '(none)'
    const errorParam  = url.searchParams.get('error') ?? '(none)'
    console.log('[auth0/callback] url:', request.url)
    console.log('[auth0/callback] state param:', stateParam)
    console.log('[auth0/callback] error param:', errorParam)
    console.log('[auth0/callback] cookies:', cookieHeader)
  }

  try {
    const res = await auth0.middleware(request)
    if (res) return res
    return NextResponse.next()
  } catch (error) {
    console.error('[auth0] handler error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(`Auth error: ${msg}`, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const res = await auth0.middleware(request)
    if (res) return res
    return NextResponse.next()
  } catch (error) {
    console.error('[auth0] handler error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(`Auth error: ${msg}`, { status: 500 })
  }
}
