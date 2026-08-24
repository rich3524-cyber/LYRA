import { NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import Stripe from 'stripe'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

const OWNER_ROLES: readonly UserRole[] = ['AGENCY_ADMIN', 'SMB_OWNER']

// Stripe's signal for "this ID doesn't exist in Stripe at all" (stale DB
// pointer, a dashboard-side deletion, a restored DB snapshot) -- distinct
// from a network/auth/rate-limit failure. The design intent here is that a
// subscription already in the state we want (gone, same as canceled) must
// not block account deletion/GDPR erasure; any OTHER retrieve failure still
// has to abort, since silently proceeding past an unrelated failure risks
// orphaning a subscription that might genuinely still be live.
function isSubscriptionMissing(error: unknown): boolean {
  return error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing'
}

// Cancels a subscription unless it's already canceled or no longer exists in
// Stripe at all. Any other retrieve/cancel error propagates to the caller.
async function cancelSubscriptionIfLive(subId: string): Promise<void> {
  let subscription: Stripe.Subscription
  try {
    subscription = await stripe.subscriptions.retrieve(subId)
  } catch (error) {
    if (isSubscriptionMissing(error)) {
      console.warn(`[DELETE /api/account] Stripe subscription ${subId} not found (resource_missing) -- treating as already gone`)
      return
    }
    throw error
  }
  if (subscription.status !== 'canceled') {
    await stripe.subscriptions.cancel(subId)
  }
}

export async function DELETE() {
  const cancelledSubIds: string[] = []
  try {
    const user = await requireAuth()

    // Only workspaces this user owns/administers get destroyed. Workspaces
    // they merely have shared access to (team member, client) instead just
    // have their own WorkspaceAccess row removed below -- deleting your own
    // account must not be able to destroy a workspace other people share.
    //
    // This is also the real "does this user actually own something" signal:
    // User.role is never written by any code path in this codebase (every
    // user sits on the schema default, SMB_OWNER), so OWNER_ROLES.includes
    // against a per-workspace WorkspaceAccess.role -- which IS populated --
    // is used instead of the always-true global role field.
    const ownedWorkspaceAccess = user.workspaceAccess.filter((wa) => OWNER_ROLES.includes(wa.role))
    const ownedWorkspaceIds = ownedWorkspaceAccess.map((wa) => wa.workspaceId)

    // Agency-level subscriptions (main plan + Crisis Aware add-on) only get
    // cancelled when this user genuinely owns at least one workspace AND is
    // the last owner-role member of the Agency -- an agency with other
    // admins shouldn't lose its subscription just because one admin account
    // is deleted.
    if (user.agency && ownedWorkspaceIds.length > 0) {
      // NB: relies on agencies being effectively single-owner today (nothing
      // in this codebase currently populates a second User.agencyId against
      // the same agency). If/when team invites let multiple users share an
      // agencyId, this count-then-cancel has a narrow TOCTOU window against a
      // concurrent deletion by another owner of the same agency.
      const otherOwners = await prisma.user.count({
        where: {
          agencyId: user.agency.id,
          id: { not: user.id },
          // WorkspaceAccessListRelationFilter.some.role.in expects UserRole[],
          // and OWNER_ROLES is readonly -- spread into a fresh mutable array.
          workspaceAccess: { some: { role: { in: [...OWNER_ROLES] } } },
        },
      })
      if (otherOwners === 0) {
        if (user.agency.stripeSubId) {
          await cancelSubscriptionIfLive(user.agency.stripeSubId)
          cancelledSubIds.push(user.agency.stripeSubId)
        }
        if (user.agency.crisisAwareSubId) {
          await cancelSubscriptionIfLive(user.agency.crisisAwareSubId)
          cancelledSubIds.push(user.agency.crisisAwareSubId)
        }
      }
    }

    // Workspace-level Trend add-on subscriptions: NOT gated on "last owner".
    // Every owned workspace here is about to be hard-deleted in the
    // transaction below regardless of who else remains in the agency, so
    // its trendSubId is about to become permanently unrecoverable -- unlike
    // the Agency row, which survives and could be fixed up later. Cancel
    // each one unconditionally before the transaction destroys the workspace.
    for (const wa of ownedWorkspaceAccess) {
      const trendSubId = wa.workspace.trendSubId
      if (trendSubId) {
        await cancelSubscriptionIfLive(trendSubId)
        cancelledSubIds.push(trendSubId)
      }
    }

    await prisma.$transaction([
      prisma.commentResponse.deleteMany({ where: { comment: { workspaceId: { in: ownedWorkspaceIds } } } }),
      prisma.comment.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.postMetrics.deleteMany({ where: { post: { workspaceId: { in: ownedWorkspaceIds } } } }),
      prisma.postApproval.deleteMany({ where: { post: { workspaceId: { in: ownedWorkspaceIds } } } }),
      prisma.post.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.socialAccount.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.brandProfile.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.guardrail.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.onboardingToken.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      // Same SEO-model gap as app/api/workspaces/[id]/route.ts's DELETE -- none of
      // these cascade at the DB level, so skipping them here throws an FK-violation
      // error on workspace.deleteMany() below for any owned workspace with SEO data.
      prisma.seoConnection.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.seoPage.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.searchConsoleData.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.workspaceAccess.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
      prisma.workspace.deleteMany({ where: { id: { in: ownedWorkspaceIds } } }),
      // Revoke this user's access to any remaining (shared, non-owned) workspaces
      // without touching those workspaces themselves.
      prisma.workspaceAccess.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ])

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // If subscriptions were already cancelled before the transaction failed,
    // that cancellation is not rolled back (Stripe isn't part of the DB
    // transaction) and the user isn't told which ones -- so log it clearly
    // at error level here, for an operator to find.
    if (cancelledSubIds.length > 0) {
      console.error(`DELETE /api/account error after cancelling Stripe subscription(s) [${cancelledSubIds.join(', ')}]:`, error)
    } else {
      console.error('DELETE /api/account error:', error)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
