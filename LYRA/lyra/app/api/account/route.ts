import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const OWNER_ROLES: readonly string[] = ['AGENCY_ADMIN', 'SMB_OWNER']

export async function DELETE() {
  try {
    const user = await requireAuth()

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
