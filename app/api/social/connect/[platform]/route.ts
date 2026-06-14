import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import * as facebook from '@/services/social/facebook'
import * as linkedin from '@/services/social/linkedin'
import * as google from '@/services/social/google-business'
import * as twitter from '@/services/social/twitter'
import * as tiktok from '@/services/social/tiktok'
import * as youtube from '@/services/social/youtube'

export const dynamic = 'force-dynamic'


export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    await requireAuth()
    const { platform } = await params
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const rerequest = searchParams.get('rerequest') === 'true'

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    let redirectUrl: string

    switch (platform) {
      case 'facebook':
        redirectUrl = facebook.getAuthUrl(workspaceId, rerequest)
        break
      case 'linkedin':
        redirectUrl = linkedin.getAuthUrl(workspaceId)
        break
      case 'google':
        redirectUrl = google.getAuthUrl(workspaceId)
        break
      case 'twitter': {
        const { url } = twitter.getAuthUrl(workspaceId)
        redirectUrl = url
        break
      }
      case 'tiktok':
        redirectUrl = tiktok.getAuthUrl(workspaceId)
        break
      case 'youtube':
        redirectUrl = youtube.getAuthUrl(workspaceId)
        break
      default:
        return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 })
    }

    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error(`GET /api/social/connect/[platform] error:`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
