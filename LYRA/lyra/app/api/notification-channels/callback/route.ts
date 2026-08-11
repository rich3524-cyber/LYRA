import { NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hasNotificationChannelAccess } from '@/lib/plan-access'
import { findZernioAccount, unwrapProfileId } from '@/services/social/zernio-connect'
import { defaultEnabledEvents } from '@/services/notifications/events'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.APP_BASE_URL!
const OWNER_ROLES: UserRole[] = ['AGENCY_ADMIN', 'SMB_OWNER']
const SLACK_SLUG = 'slack'

function fail(workspaceId: string | null, code: string) {
  if (!workspaceId) return NextResponse.redirect(`${BASE_URL}?error=oauth_failed`)
  return NextResponse.redirect(`${BASE_URL}/workspace/${workspaceId}/settings?error=${code}`)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId')
  const connectedSlug = searchParams.get('connected')
  const zernioAccountId = searchParams.get('accountId')
  const channelName = searchParams.get('username') ?? ''

  if (!workspaceId) return fail(null, 'oauth_failed')

  try {
    const user = await requireAuth()

    // Same cross-tenant protection as the social-account callback: a forged
    // workspaceId in the redirect must not inject a channel into another
    // tenant's workspace. Role-gated too, matching the connect route -- the
    // redirect URL is guessable, so the callback cannot rely on the connect
    // route having already checked.
    const workspace = await prisma.workspace.findFirst({
      where:  { id: workspaceId, access: { some: { userId: user.id, role: { in: OWNER_ROLES } } } },
      select: { id: true, plan: true, zernioProfileId: true, agency: { select: { crisisAwareSubId: true } } },
    })
    if (!workspace) return fail(workspaceId, 'oauth_failed')

    if (!hasNotificationChannelAccess(workspace.plan, workspace.agency?.crisisAwareSubId)) {
      return fail(workspaceId, 'notifications_plan_required')
    }

    if (!connectedSlug) {
      // Cancelled on Zernio's hosted page, or the flow didn't complete.
      console.error(
        `Notification channel callback: connect failed for workspace ${workspaceId} -- raw query: ${searchParams.toString()}`
      )
      return fail(workspaceId, 'notifications_connect_failed')
    }

    if (!workspace.zernioProfileId) {
      console.error(
        `Notification channel callback: workspace ${workspaceId} has no zernioProfileId; refusing to link accountId ${zernioAccountId}`
      )
      return fail(workspaceId, 'notifications_connect_failed')
    }

    // ZERNIO_API_KEY is one master key shared across every LYRA workspace, so
    // the query params Zernio appends here are not tenant-scoped on their own.
    // Verify the returned account genuinely belongs to THIS workspace's Zernio
    // profile before storing it.
    const matchedAccount = zernioAccountId
      ? await findZernioAccount({ zernioAccountId })
      : await findZernioAccount({ profileId: workspace.zernioProfileId, platform: SLACK_SLUG })

    if (!matchedAccount || unwrapProfileId(matchedAccount) !== workspace.zernioProfileId) {
      console.error(
        `Notification channel callback: accountId ${zernioAccountId} does not belong to workspace ${workspaceId}'s Zernio profile (${workspace.zernioProfileId}) -- looks like a forged or cross-tenant accountId`
      )
      return fail(workspaceId, 'notifications_connect_failed')
    }

    // Guard against a Slack connect flow returning a non-Slack account. The
    // verified record is the trustworthy source, not the unsigned query param.
    if (matchedAccount.platform !== SLACK_SLUG) {
      console.error(
        `Notification channel callback: expected a slack account, got "${matchedAccount.platform}" for workspace ${workspaceId}`
      )
      return fail(workspaceId, 'notifications_connect_failed')
    }

    const resolvedAccountId = zernioAccountId ?? matchedAccount._id ?? matchedAccount.accountId
    if (!resolvedAccountId) {
      console.error(`Notification channel callback: matched account has no usable id for workspace ${workspaceId}`)
      return fail(workspaceId, 'notifications_connect_failed')
    }

    // Upsert rather than create: a user who reconnects after a revoked Slack
    // app would otherwise hit the workspaceId unique constraint and see a
    // generic failure. Reconnecting preserves the existing event toggles --
    // re-picking them after every reconnect would be a real annoyance.
    await prisma.notificationChannel.upsert({
      where:  { workspaceId },
      create: {
        workspaceId,
        type:            'SLACK',
        zernioAccountId: resolvedAccountId,
        label:           channelName || null,
        enabledEvents:   defaultEnabledEvents(),
      },
      update: {
        type:                'SLACK',
        zernioAccountId:     resolvedAccountId,
        label:               channelName || null,
        lastDeliveryError:   null,
        consecutiveFailures: 0,
      },
    })

    return NextResponse.redirect(
      `${BASE_URL}/workspace/${workspaceId}/settings?notifications=connected`
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/notification-channels/callback error:', error)
    return fail(workspaceId, 'notifications_connect_failed')
  }
}
