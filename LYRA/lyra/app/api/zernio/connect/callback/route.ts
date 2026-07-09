import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { zernioClient } from '@/services/social/zernio-client'
import { fromZernioPlatform } from '@/services/social/provider/platform-map'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.APP_BASE_URL!

// GET /v1/accounts is flaky -- confirmed live 2026-07-09 by calling it four times in a
// row immediately after a real successful connection: empty, populated, empty, empty.
// A single call right after the OAuth redirect can easily miss an account that
// genuinely exists, which would wrongly kill a successful connection. Retry several
// times with backoff before concluding the account really isn't there. Facebook in
// particular took longer than LinkedIn to show up even with the original 4-attempt/3s
// window (extra page-selection/Graph API round trip on Zernio's backend), so this
// spans ~9s worst case.
async function findZernioAccount(zernioAccountId: string) {
  const delaysMs = [0, 500, 1000, 1500, 2000, 2000, 2000]
  for (const delay of delaysMs) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    const { accounts } = await zernioClient.listAccounts()
    const match = accounts.find(
      (account) => account._id === zernioAccountId || account.accountId === zernioAccountId
    )
    if (match) return match
  }
  return undefined
}

// TEMP diagnostic aid (2026-07-09): Netlify function logs aren't reachable from this
// session, and the callback has failed intermittently for reasons that vary between
// attempts (stale profileId shape, flaky list endpoint, a genuine disconnect). This
// records exactly what Zernio sent and how we resolved it so the next failure is
// diagnosable without guessing. Remove once the connect flow has proven stable.
async function logDebug(row: {
  workspaceId: string | null
  rawQuery: string
  zernioAccountId: string | null
  connectedSlug: string | null
  matchedAccountId?: string
  matchedProfileId?: string
  workspaceZernioProfileId?: string
  outcome: string
}) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ZernioConnectDebugLog"
        ("workspaceId", "rawQuery", "zernioAccountId", "connectedSlug", "matchedAccountId", "matchedProfileId", "workspaceZernioProfileId", "outcome")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      row.workspaceId,
      row.rawQuery,
      row.zernioAccountId,
      row.connectedSlug,
      row.matchedAccountId ?? null,
      row.matchedProfileId ?? null,
      row.workspaceZernioProfileId ?? null,
      row.outcome
    )
  } catch (logError) {
    console.error('Zernio callback: failed to write debug log', logError)
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const connectedSlug = searchParams.get('connected')
  const zernioAccountId = searchParams.get('accountId')
  const username = searchParams.get('username') ?? ''
  const rawQuery = searchParams.toString()

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
      await logDebug({ workspaceId, rawQuery, zernioAccountId, connectedSlug, outcome: 'missing connected/accountId param' })
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
      await logDebug({ workspaceId, rawQuery, zernioAccountId, connectedSlug, outcome: 'workspace has no zernioProfileId' })
      return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
    }

    const matchedAccount = await findZernioAccount(zernioAccountId)
    // profileId comes back as a populated object ({ _id, name }), not a bare string --
    // confirmed live 2026-07-09. Unwrap before comparing, or every real connection fails
    // this check (object !== string) and gets rejected as cross-tenant.
    const matchedProfileId =
      typeof matchedAccount?.profileId === 'string' ? matchedAccount.profileId : matchedAccount?.profileId?._id
    if (!matchedAccount || matchedProfileId !== workspace.zernioProfileId) {
      console.error(
        `Zernio callback: accountId ${zernioAccountId} does not belong to workspace ${workspaceId}'s Zernio profile (${workspace.zernioProfileId}) -- looks like a forged or cross-tenant accountId`
      )
      await logDebug({
        workspaceId,
        rawQuery,
        zernioAccountId,
        connectedSlug,
        matchedAccountId: matchedAccount?._id ?? matchedAccount?.accountId,
        matchedProfileId,
        workspaceZernioProfileId: workspace.zernioProfileId,
        outcome: matchedAccount ? 'profileId mismatch' : 'account not found after retries',
      })
      return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
    }

    // Derive the stored platform from the VERIFIED account record, not the unsigned
    // `connected` query param -- connectedSlug already had to match to reach this point
    // (via the earlier presence check), but matchedAccount.platform is the value Zernio
    // itself associates with the ownership-checked account, so it's the more trustworthy
    // source now that we have it.
    const platform = fromZernioPlatform(matchedAccount.platform) ?? fromZernioPlatform(connectedSlug)
    if (!platform) {
      await logDebug({
        workspaceId,
        rawQuery,
        zernioAccountId,
        connectedSlug,
        matchedAccountId: matchedAccount._id ?? matchedAccount.accountId,
        matchedProfileId,
        workspaceZernioProfileId: workspace.zernioProfileId,
        outcome: `unrecognized platform: ${matchedAccount.platform}`,
      })
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

    await logDebug({
      workspaceId,
      rawQuery,
      zernioAccountId,
      connectedSlug,
      matchedAccountId: matchedAccount._id ?? matchedAccount.accountId,
      matchedProfileId,
      workspaceZernioProfileId: workspace.zernioProfileId,
      outcome: 'success',
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
    await logDebug({
      workspaceId,
      rawQuery,
      zernioAccountId,
      connectedSlug,
      outcome: `exception: ${error instanceof Error ? error.message : String(error)}`,
    })
    return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
  }
}
