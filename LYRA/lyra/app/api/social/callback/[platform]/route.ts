import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyState } from '@/lib/oauth-state'
import * as twitter from '@/services/social/twitter'
import {
  connectFacebook,
  connectLinkedIn,
  connectGoogleBusiness,
  connectTwitter,
  connectTikTok,
  connectYouTube,
} from '@/services/social/oauth-connect'

export const dynamic = 'force-dynamic'


const BASE_URL = process.env.APP_BASE_URL!

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const user = await requireAuth()
    const { platform } = await params
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const rawState = searchParams.get('state')
    const state = verifyState<{ workspaceId: string }>(rawState)

    if (!code || !state?.workspaceId) {
      return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)
    }
    const { workspaceId } = state

    // Verify the authenticated user actually has access to the target workspace.
    // Without this check, any logged-in user could forge the state parameter and
    // inject social tokens into another tenant's workspace.
    const workspaceAccess = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!workspaceAccess) {
      return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)
    }

    switch (platform) {
      case 'facebook': {
        const { pendingKey } = await connectFacebook(workspaceId, code)
        return NextResponse.redirect(
          `${BASE_URL}/workspace/${workspaceId}/settings?fbpending=${pendingKey}`
        )
      }

      case 'linkedin': {
        const { connected } = await connectLinkedIn(workspaceId, code)
        if (!connected) {
          return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=linkedin_no_orgs`)
        }
        break
      }

      case 'google': {
        await connectGoogleBusiness(workspaceId, code)
        break
      }

      case 'twitter': {
        // rawState is guaranteed non-null here: verifyState(null) would have returned
        // null, and the !state?.workspaceId check above already rejected that case.
        const codeVerifier = await twitter.consumeCodeVerifier(rawState!)
        if (!codeVerifier) return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)

        await connectTwitter(workspaceId, code, codeVerifier)
        break
      }

      case 'tiktok': {
        await connectTikTok(workspaceId, code)
        break
      }

      case 'youtube': {
        await connectYouTube(workspaceId, code)
        break
      }

      default:
        return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 })
    }

    return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?connected=${platform}`)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error(`GET /api/social/callback/[platform] error:`, error)
    return NextResponse.redirect(`${BASE_URL}/dashboard?error=oauth_failed`)
  }
}
