import type { Plan } from '@prisma/client'

// Plan-level feature gates that depend on more than the plan tier alone --
// i.e. anything an add-on subscription can unlock for a lower tier.
//
// These lived inline in the workspace settings page. Extracted here because
// notification channels need the exact same expression, and a copied auth
// expression is the same drift risk that let the Approve button diverge from
// its own backend check (see APPROVER_ROLES in lib/authz.ts). One rule, one
// place, enforced server-side -- never in the UI alone.

/**
 * Crisis Aware is bundled into Agency, and sold to Pro as an add-on
 * subscription held on the Agency record.
 */
export function hasCrisisAwareAccess(
  plan: Plan,
  crisisAwareSubId: string | null | undefined
): boolean {
  return plan === 'AGENCY' || (plan === 'PRO' && !!crisisAwareSubId)
}

/**
 * Slack/Teams notification channels: bundled into Agency, and also available
 * to a Pro workspace that pays for Crisis Aware -- with the full event set,
 * not crisis events alone. Selling someone a crisis feature and then
 * withholding the after-hours channel that makes it useful is the wrong
 * product call.
 *
 * Deliberately a separate named export rather than an alias of
 * hasCrisisAwareAccess, even though the two expressions currently agree.
 * Same reasoning as APPROVER_ROLES vs canWrite in lib/authz.ts: they answer
 * different product questions, and collapsing them means a future pricing
 * change to one silently moves the other.
 */
export function hasNotificationChannelAccess(
  plan: Plan,
  crisisAwareSubId: string | null | undefined
): boolean {
  return plan === 'AGENCY' || (plan === 'PRO' && !!crisisAwareSubId)
}
