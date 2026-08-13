import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWrite } from '@/lib/authz'
import { findZernioAccount, unwrapProfileId } from '@/services/social/zernio-connect'
import { fromZernioPlatform } from '@/services/social/provider/platform-map'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.APP_BASE_URL!

// findZernioAccount and its live-established retry behaviour now live in
// services/social/zernio-connect.ts, shared with the notification-channel
// connect flow.

// Zernio-side error codes we recognize and want to surface specifically (see
// CONNECT_ERRORS in the settings page) rather than the generic
// zernio_connect_failed message. Confirmed live 2026-07-20: Zernio's redirect
// on a Facebook connect failure includes `error=no_facebook_pages` -- our own
// callback was previously only checking for `connected` and silently
// discarding this, which is why Facebook connect failures always showed a
// generic "try again" with no indication of what was actually wrong.
const KNOWN_ZERNIO_ERRORS = new Set(['no_facebook_pages'])

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const connectedSlug = searchParams.get('connected')
  const zernioAccountId = searchParams.get('accountId')
  const username = (searchParams.get('username') ?? '').slice(0, 120)
  const zernioError = searchParams.get('error')

  if (!workspaceId) {
    return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)
  }

  try {
    const user = await requireAuth()

    // Verify the authenticated user actually has access to the target workspace,
    // with write access -- this callback is directly reachable by URL (the
    // redirect it's guessable from doesn't guarantee the connect route's own
    // role check already ran), same reasoning as the notification-channel
    // callback's OWNER_ROLES check. Without this, a read-only CLIENT_VIEW
    // member could flip a deactivated account back to isActive: true and
    // overwrite its handle/name via this URL directly.
    const workspaceAccess = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!workspaceAccess || !canWrite(workspaceAccess.role)) {
      return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)
    }

    if (!connectedSlug) {
      // User cancelled on Zernio's hosted page, the flow didn't complete, or
      // Zernio reported a specific reason via its own `error` param.
      console.error(
        `Zernio callback: connect failed for workspace ${workspaceId} -- raw query: ${searchParams.toString()}`
      )
      const errorCode = zernioError && KNOWN_ZERNIO_ERRORS.has(zernioError)
        ? `zernio_${zernioError}`
        : 'zernio_connect_failed'
      return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=${errorCode}`)
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

    const matchedAccount = zernioAccountId
      ? await findZernioAccount({ zernioAccountId })
      : await findZernioAccount({ profileId: workspace.zernioProfileId, platform: connectedSlug })
    // profileId comes back as a populated object ({ _id, name }), not a bare string --
    // confirmed live 2026-07-09. Unwrap before comparing, or every real connection fails
    // this check (object !== string) and gets rejected as cross-tenant.
    const matchedProfileId = unwrapProfileId(matchedAccount)
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
      console.error(`Zernio callback: unrecognized platform "${matchedAccount.platform}" for workspace ${workspaceId}`)
      return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
    }

    // The query string's accountId is missing for some platforms (Facebook -- see
    // findZernioAccount above), so fall back to the id on the verified account record
    // itself. Either way this is the ownership-checked id, never a client-supplied one.
    const resolvedAccountId = zernioAccountId ?? matchedAccount._id ?? matchedAccount.accountId
    if (!resolvedAccountId) {
      console.error(`Zernio callback: matched account has no usable id for workspace ${workspaceId}`)
      return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=zernio_connect_failed`)
    }

    // platformId stores the Zernio account id for ZERNIO-provider accounts (there
    // is no native platform id available here) -- same uniqueness guarantee as
    // native accounts, different source. zernioAccountId is stored again on its
    // own column so provider code doesn't need to know this convention.
    await prisma.socialAccount.upsert({
      where: {
        workspaceId_platform_platformId: { workspaceId, platform, platformId: resolvedAccountId },
      },
      create: {
        workspaceId,
        platform,
        platformId: resolvedAccountId,
        handle: username,
        name: username,
        accessToken: null,
        provider: 'ZERNIO',
        zernioAccountId: resolvedAccountId,
      },
      update: {
        handle: username,
        name: username,
        provider: 'ZERNIO',
        zernioAccountId: resolvedAccountId,
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
