import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE() {
  try {
    const user = await requireAuth()

    const workspaceIds = user.workspaceAccess.map((wa) => wa.workspaceId)

    await prisma.$transaction([
      prisma.commentResponse.deleteMany({ where: { comment: { workspaceId: { in: workspaceIds } } } }),
      prisma.comment.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
      prisma.postMetrics.deleteMany({ where: { post: { workspaceId: { in: workspaceIds } } } }),
      prisma.postApproval.deleteMany({ where: { post: { workspaceId: { in: workspaceIds } } } }),
      prisma.post.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
      prisma.socialAccount.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
      prisma.brandProfile.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
      prisma.guardrail.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
      prisma.onboardingToken.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
      prisma.workspaceAccess.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
      prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } }),
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
