import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fromZernioPlatform } from '@/services/social/provider/platform-map'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.APP_BASE_URL!

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const connectedSlug = searchParams.get('connected')
  const zernioAccountId = searchParams.get('accountId')
  const username = searchParams.get('username') ?? ''

  if (!workspaceId) {
    return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)
  }

  try {
    const user = await requireAuth()

    // Verify the authenticated user actually has access to the target workspace.
    // Same cross-tenant protection as /api/social/callback/[platform] -- without
    // this, a forged workspaceId in the redirect could inject a Zernio account
    // into another tenant's workspace.
    const workspaceAccess = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!workspaceAccess) {
      return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)
    }

    if (!connectedSlug || !zernioAccountId) {
      // User cancelled on Zernio's hosted page, or the flow didn't complete.
      return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
    }

    const platform = fromZernioPlatform(connectedSlug)
    if (!platform) {
      return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
    }

    // platformId stores the Zernio account id for ZERNIO-provider accounts (there
    // is no native platform id available here) -- same uniqueness guarantee as
    // native accounts, different source. zernioAccountId is stored again on its
    // own column so provider code doesn't need to know this convention.
    await prisma.socialAccount.upsert({
      where: {
        workspaceId_platform_platformId: { workspaceId, platform, platformId: zernioAccountId },
      },
      create: {
        workspaceId,
        platform,
        platformId: zernioAccountId,
        handle: username,
        name: username,
        accessToken: null,
        provider: 'ZERNIO',
        zernioAccountId,
      },
      update: {
        handle: username,
        name: username,
        provider: 'ZERNIO',
        zernioAccountId,
        isActive: true,
      },
    })

    return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?connected=${connectedSlug}`)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/zernio/connect/callback error:', error)
    return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
  }
}
