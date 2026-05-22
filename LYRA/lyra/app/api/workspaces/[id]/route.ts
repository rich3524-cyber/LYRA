import { NextResponse } from 'next/server'
import { Autonomy } from '@prisma/client'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PLANS } from '@/lib/stripe'

export const dynamic = 'force-dynamic'


const AUTONOMY_ORDER: Autonomy[] = ['OFF', 'DRAFT_APPROVE', 'FULL']

function clampAutonomy(requested: string, max: Autonomy): Autonomy {
  const reqIdx = AUTONOMY_ORDER.indexOf(requested as Autonomy)
  const maxIdx = AUTONOMY_ORDER.indexOf(max)
  if (reqIdx === -1) return 'OFF'
  return AUTONOMY_ORDER[Math.min(reqIdx, maxIdx)]
}

async function getWorkspaceForUser(id: string, userId: string) {
  return prisma.workspace.findFirst({
    where: { id, access: { some: { userId } } },
  })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const workspace = await prisma.workspace.findFirst({
      where: { id, access: { some: { userId: user.id } } },
      include: {
        access: { select: { userId: true, role: true } },
        socialAccounts: { select: { id: true, platform: true, name: true, isActive: true } },
      },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    return NextResponse.json(workspace)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/workspaces/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const existing = await getWorkspaceForUser(id, user.id)
    if (!existing) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const body = await req.json()
    const { name, industry, websiteUrl, clientAccessLevel, aiResponseMode } = body

    let resolvedMode: Autonomy | undefined
    if (aiResponseMode !== undefined) {
      const planKey = existing.plan as keyof typeof PLANS
      const maxAutonomy: Autonomy = PLANS[planKey]?.maxAutonomy ?? 'OFF'
      resolvedMode = clampAutonomy(aiResponseMode, maxAutonomy)
    }

    const workspace = await prisma.workspace.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(industry !== undefined && { industry }),
        ...(websiteUrl !== undefined && { websiteUrl }),
        ...(clientAccessLevel !== undefined && { clientAccessLevel }),
        ...(resolvedMode !== undefined && { aiResponseMode: resolvedMode }),
      },
    })

    return NextResponse.json(workspace)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PATCH /api/workspaces/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const existing = await getWorkspaceForUser(id, user.id)
    if (!existing) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Delete in dependency order — schema has no cascade rules
    await prisma.$transaction([
      // CommentResponse → Comment
      prisma.commentResponse.deleteMany({
        where: { comment: { workspaceId: id } },
      }),
      // Comment depends on SocialAccount + Post
      prisma.comment.deleteMany({ where: { workspaceId: id } }),
      // PostMetrics + PostApproval depend on Post
      prisma.postMetrics.deleteMany({ where: { post: { workspaceId: id } } }),
      prisma.postApproval.deleteMany({ where: { post: { workspaceId: id } } }),
      // Posts depend on SocialAccount + Workspace
      prisma.post.deleteMany({ where: { workspaceId: id } }),
      // Remaining workspace children
      prisma.socialAccount.deleteMany({ where: { workspaceId: id } }),
      prisma.brandProfile.deleteMany({ where: { workspaceId: id } }),
      prisma.guardrail.deleteMany({ where: { workspaceId: id } }),
      prisma.onboardingToken.deleteMany({ where: { workspaceId: id } }),
      prisma.workspaceAccess.deleteMany({ where: { workspaceId: id } }),
      prisma.workspace.delete({ where: { id } }),
    ])

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/workspaces/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
