import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPlatformLabel } from '@/lib/platform-labels'
import { isApprovalOverdue, hoursWaiting } from '@/services/notifications/approval-sla'
import { notifyChannel } from '@/services/notifications/channel-notifier'

export const dynamic = 'force-dynamic'

// Bounded like the publish-due-posts cron, so one pathological workspace can't
// make this run past Netlify's function ceiling. Hitting it is logged, never
// silent -- a truncated sweep that reports success reads as "everything is
// fine" when it isn't.
const MAX_CANDIDATES = 500

export async function GET(req: Request) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Only workspaces that have a channel with this event switched on. Two
  // reasons: there is nowhere to deliver otherwise, and claiming slaAlertedAt
  // for a workspace with no channel would permanently consume the one alert
  // those posts get -- they would stay silent forever after connecting one.
  const candidates = await prisma.post.findMany({
    where: {
      status:    'PENDING_APPROVAL',
      approval:  { status: 'PENDING', slaAlertedAt: null },
      workspace: {
        notificationChannel: { is: { enabledEvents: { has: 'APPROVAL_SLA_BREACH' } } },
      },
    },
    select: {
      id:            true,
      content:       true,
      scheduledAt:   true,
      workspaceId:   true,
      socialAccount: { select: { platform: true } },
      approval:      { select: { id: true, submittedAt: true } },
      workspace:     {
        select: { name: true, approvalSlaHours: true, approvalSlaUnscheduledHours: true },
      },
    },
    take: MAX_CANDIDATES,
  })

  if (candidates.length === MAX_CANDIDATES) {
    console.warn(
      `check-approval-slas: hit the ${MAX_CANDIDATES}-candidate cap; some pending approvals were not evaluated this run`
    )
  }

  let alerted = 0

  for (const post of candidates) {
    if (!post.approval) continue

    const config = {
      approvalSlaHours:            post.workspace.approvalSlaHours,
      approvalSlaUnscheduledHours: post.workspace.approvalSlaUnscheduledHours,
    }
    const subject = { scheduledAt: post.scheduledAt, submittedAt: post.approval.submittedAt }
    if (!isApprovalOverdue(subject, config, now)) continue

    // Claim before notifying, scoped to slaAlertedAt still being null. Two
    // overlapping cron runs both see the post as overdue, but only one write
    // matches -- the loser skips. Same atomic-claim pattern as the Comment
    // status guards. Claiming first means a delivery failure loses the alert
    // rather than repeating it, which is the right direction for a rule the
    // product defines as firing exactly once.
    const { count } = await prisma.postApproval.updateMany({
      where: { id: post.approval.id, slaAlertedAt: null },
      data:  { slaAlertedAt: now },
    })
    if (count === 0) continue

    await notifyChannel(
      post.workspaceId,
      {
        event:             'APPROVAL_SLA_BREACH',
        workspaceName:     post.workspace.name,
        platform:          getPlatformLabel(post.socialAccount.platform),
        excerpt:           post.content,
        scheduledAt:       post.scheduledAt,
        waitingSinceHours: hoursWaiting(post.approval.submittedAt, now),
      },
      // One alert per approval row, so a resubmission (which clears
      // slaAlertedAt and stamps a fresh submittedAt) can alert again while a
      // re-run within the same cycle cannot.
      { dedupeKey: `sla-${post.approval.id}` }
    )
    alerted++
  }

  return NextResponse.json({ scanned: candidates.length, alerted })
}
