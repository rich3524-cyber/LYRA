import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/services/social/linkedin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const testUrl = getAuthUrl('debug-test')
  const url = new URL(testUrl)
  const scope = url.searchParams.get('scope') ?? ''
  const scopes = scope.split(' ').filter(Boolean)

  return NextResponse.json({
    commit: 'dcdd651',
    ts: new Date().toISOString(),
    linkedin_scope: scope,
    scope_count: scopes.length,
    scopes,
    expected_count: 9,
    ok: scopes.length === 9,
  })
}
