import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { zernioClient } from '@/services/social/zernio-client'
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

    // Verify the accountId in the query string actually belongs to THIS workspace's
    // Zernio profile before trusting it. ZERNIO_API_KEY is one master key shared across
    // every LYRA workspace, so the query params Zernio appends to this redirect are not
    // scoped to a tenant on their own -- without this check, any authenticated user could
    // hit this URL directly with a real accountId belonging to a DIFFERENT workspace's
    // Zernio-connected account and have it upserted into their own workspace.
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
    if (!workspace?.zernioProfileId) {
      console.error(
        `Zernio callback: workspace ${workspaceId} has no zernioProfileId yet; refusing to link accountId ${zernioAccountId}`
      )
      return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
    }

    const { accounts } = await zernioClient.listAccounts()
    const matchedAccount = accounts.find(
      (account) => account._id === zernioAccountId || account.accountId === zernioAccountId
    )
    // profileId comes back as a populated object ({ _id, name }), not a bare string --
    // confirmed live 2026-07-09. Unwrap before comparing, or every real connection fails
    // this check (object !== string) and gets rejected as cross-tenant.
    const matchedProfileId =
      typeof matchedAccount?.profileId === 'string' ? matchedAccount.profileId : matchedAccount?.profileId?._id
    if (!matchedAccount || matchedProfileId !== workspace.zernioProfileId) {
      console.error(
        `Zernio callback: accountId ${zernioAccountId} does not belong to workspace ${workspaceId}'s Zernio profile (${workspace.zernioProfileId}) -- looks like a forged or cross-tenant accountId`
      )
      return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
    }

    // Derive the stored platform from the VERIFIED account record, not the unsigned
    // `connected` query param -- connectedSlug already had to match to reach this point
    // (via the earlier presence check), but matchedAccount.platform is the value Zernio
    // itself associates with the ownership-checked account, so it's the more trustworthy
    // source now that we have it.
    const platform = fromZernioPlatform(matchedAccount.platform) ?? fromZernioPlatform(connectedSlug)
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

    // Redirect with the verified Prisma enum (lowercased), not the raw Zernio slug --
    // the settings page's PLATFORM_LABELS lookup keys on `connected.toUpperCase()`
    // matching the Prisma Platform enum (e.g. GOOGLE_BUSINESS), which `googlebusiness`
    // (Zernio's slug) doesn't uppercase into.
    return NextResponse.redirect(
      `${BASE_URL}/workspace/${workspaceId}/settings?connected=${platform.toLowerCase()}`
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/zernio/connect/callback error:', error)
    return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
  }
}
