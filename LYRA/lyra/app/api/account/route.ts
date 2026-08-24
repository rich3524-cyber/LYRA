import { NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

const OWNER_ROLES: readonly UserRole[] = ['AGENCY_ADMIN', 'SMB_OWNER']

export async function DELETE() {
  try {
    const user = await requireAuth()

    // If this user is an owner-role member of an Agency with a live Stripe
    // subscription, and no other owner-role member remains to manage it,
    // cancel it before deleting anything -- otherwise the Agency row survives
    // (nothing else in the codebase deletes Agency rows) as an orphan with a
    // subscription that bills forever with no LYRA user left to stop it.
    if (user.agency && OWNER_ROLES.includes(user.role) && user.agency.stripeSubId) {
      const otherOwners = await prisma.user.count({
        // EnumUserRoleFilter.in expects UserRole[], and OWNER_ROLES is
        // readonly -- spread it into a fresh mutable array to satisfy Prisma's type.
        where: { agencyId: user.agency.id, id: { not: user.id }, role: { in: [...OWNER_ROLES] } },
      })
      if (otherOwners === 0) {
        const subscription = await stripe.subscriptions.retrieve(user.agency.stripeSubId)
        if (subscription.status !== 'canceled') {
          await stripe.subscriptions.cancel(user.agency.stripeSubId)
        }
      }
    }

    // Only workspaces this user owns/administers get destroyed. Workspaces
    // they merely have shared access to (team member, client) instead just
    // have their own WorkspaceAccess row removed below -- deleting your own
    // account must not be able to destroy a workspace other people share.
    const ownedWorkspaceIds = user.workspaceAccess
      .filter((wa) => OWNER_ROLES.includes(wa.role))
      .map((wa) => wa.workspaceId)

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
    console.error('DELETE /api/account error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
