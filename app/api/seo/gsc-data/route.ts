import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/encrypt'
import { refreshAccessToken, getTopQueries, getClicksTrend } from '@/services/seo/gsc-client'

export const dynamic = 'force-dynamic'


export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const conn = await prisma.seoConnection.findFirst({
      where: {
        workspaceId,
        workspace: { access: { some: { userId: user.id } } },
      },
    })
    if (!conn) return NextResponse.json({ error: 'GSC not connected' }, { status: 404 })

    let accessToken = decrypt(conn.accessToken)

    // Proactively refresh — GSC tokens expire in 1 hour
    try {
      const fresh = await refreshAccessToken(decrypt(conn.refreshToken))
      accessToken = fresh
      await prisma.seoConnection.update({
        where: { id: conn.id },
        data: { accessToken: encrypt(fresh) },
      })
    } catch {
      // Refresh failed — attempt with existing token; user may need to reconnect
    }

    const [queries, trend] = await Promise.all([
      getTopQueries(accessToken, conn.propertyUrl),
      getClicksTrend(accessToken, conn.propertyUrl),
    ])

    return NextResponse.json({ propertyUrl: conn.propertyUrl, queries, trend })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/seo/gsc-data error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
