// The approval-deadline rule, as one pure function.
//
// Shared by the cron that fires APPROVAL_SLA_BREACH and by the UI that renders
// the "Approval overdue" badge. The badge is derived from this rule at render
// time rather than from the stored slaAlertedAt flag, so it reflects current
// reality even before the cron has run, and clears the instant a post is
// approved.

const MS_PER_HOUR = 3_600_000

export interface ApprovalSlaConfig {
  /** Hours before scheduledAt that an unapproved post becomes overdue. */
  approvalSlaHours: number
  /** Hours after submission that an unscheduled unapproved post becomes overdue. */
  approvalSlaUnscheduledHours: number
}

export interface ApprovalSlaSubject {
  scheduledAt: Date | null
  /** Start of the current pending cycle. Null on rows predating this feature. */
  submittedAt: Date | null
}

/**
 * The moment this post becomes overdue, or null if no deadline applies.
 *
 * Two rules, because a post can reach PENDING_APPROVAL with no scheduled time:
 *   - scheduledAt set  -> scheduledAt minus approvalSlaHours
 *   - scheduledAt null -> submittedAt plus approvalSlaUnscheduledHours
 *
 * Returns null for an unscheduled post with no submittedAt. Those are rows
 * created before this feature shipped, and there is genuinely no clock to
 * measure -- treating null as "epoch" would flag every historical pending post
 * as overdue on the first cron run.
 */
export function approvalDeadline(
  subject: ApprovalSlaSubject,
  config: ApprovalSlaConfig
): Date | null {
  if (subject.scheduledAt) {
    return new Date(subject.scheduledAt.getTime() - config.approvalSlaHours * MS_PER_HOUR)
  }
  if (subject.submittedAt) {
    return new Date(subject.submittedAt.getTime() + config.approvalSlaUnscheduledHours * MS_PER_HOUR)
  }
  return null
}

export function isApprovalOverdue(
  subject: ApprovalSlaSubject,
  config: ApprovalSlaConfig,
  now: Date = new Date()
): boolean {
  const deadline = approvalDeadline(subject, config)
  if (!deadline) return false
  return now.getTime() >= deadline.getTime()
}

/**
 * Whole hours a post has been waiting, for the alert body. Floored, and never
 * negative -- a clock skew shouldn't produce "waiting -1 hours".
 */
export function hoursWaiting(submittedAt: Date | null, now: Date = new Date()): number {
  if (!submittedAt) return 0
  return Math.max(0, Math.floor((now.getTime() - submittedAt.getTime()) / MS_PER_HOUR))
}
