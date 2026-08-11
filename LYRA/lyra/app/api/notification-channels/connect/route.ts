import { NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { hasNotificationChannelAccess } from '@/lib/plan-access'
import { zernioClient, ZernioApiError } from '@/services/social/zernio-client'
import { ensureZernioProfile } from '@/services/social/zernio-connect'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.APP_BASE_URL!

// Connecting an alerts channel is a workspace settings change, so it matches
// the OWNER_ROLES policy used by PATCH /api/workspaces/[id] rather than the
// broader canWrite rule.
const OWNER_ROLES: UserRole[] = ['AGENCY_ADMIN', 'SMB_OWNER']

// Zernio's platform slug. Deliberately not routed through platform-map.ts:
// that map is an exhaustive Platform-enum-to-slug table for publishing
// destinations, and Slack is not a Platform (see the NotificationChannel model
// comment in schema.prisma).
const SLACK_SLUG = 'slack'

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const workspace = await prisma.workspace.findFirst({
      where:  { id: workspaceId, access: { some: { userId: user.id, role: { in: OWNER_ROLES } } } },
      select: { id: true, name: true, plan: true, agency: { select: { crisisAwareSubId: true } } },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!hasNotificationChannelAccess(workspace.plan, workspace.agency?.crisisAwareSubId)) {
      return NextResponse.redirect(
        `${BASE_URL}/workspace/${workspaceId}/settings?error=notifications_plan_required`
      )
    }

    // One channel per workspace. Enforced by a unique constraint too, but
    // checking here avoids sending the user through an OAuth round trip that
    // could only fail (and would still bill them a Zernio account).
    const existing = await prisma.notificationChannel.findUnique({
      where:  { workspaceId },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.redirect(
        `${BASE_URL}/workspace/${workspaceId}/settings?error=notifications_already_connected`
      )
    }

    const zernioProfileId = await ensureZernioProfile(workspaceId, workspace.name)
    const redirectUrl = `${BASE_URL}/api/notification-channels/callback?workspaceId=${encodeURIComponent(workspaceId)}`
    const { authUrl } = await zernioClient.getConnectUrl(SLACK_SLUG, zernioProfileId, redirectUrl)

    return NextResponse.redirect(authUrl)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ZernioApiError) {
      console.error(`GET /api/notification-channels/connect Zernio error (${error.status}):`, error.message)
      const status = error.status >= 400 && error.status < 500 ? error.status : 502
      return NextResponse.json({ error: error.message }, { status })
    }
    console.error('GET /api/notification-channels/connect error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
