import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getAuthUrl } from '@/services/seo/gsc-client'

export async function GET(req: Request) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }
    return NextResponse.redirect(getAuthUrl(workspaceId))
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/seo/connect error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
