import { auth0 } from '@/lib/auth0'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    return (await auth0.middleware(request)) ?? NextResponse.next()
  } catch (error) {
    console.error('[auth0] handler error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(`Auth error: ${msg}`, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    return (await auth0.middleware(request)) ?? NextResponse.next()
  } catch (error) {
    console.error('[auth0] handler error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(`Auth error: ${msg}`, { status: 500 })
  }
}
