import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { UserRole } from '@prisma/client'

// Settings changes and deletion are owner-level actions -- previously gated on
// mere membership, so any role including a read-only CLIENT_VIEW could delete
// or reconfigure the whole workspace. GET (viewing) intentionally stays
// membership-only; only PATCH/DELETE pass `roles`.
const OWNER_ROLES: UserRole[] = ['AGENCY_ADMIN', 'SMB_OWNER']

async function getWorkspaceForUser(id: string, userId: string, roles?: UserRole[]) {
  return prisma.workspace.findFirst({
    where: { id, access: { some: { userId, ...(roles ? { role: { in: roles } } : {}) } } },
    select: { id: true, plan: true },
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

    const existing = await getWorkspaceForUser(id, user.id, OWNER_ROLES)
    if (!existing) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const body = await req.json()
    const { name, industry, websiteUrl, clientAccessLevel, aiResponseMode, crisisAware, timezone } = body

    // Plan gate: Starter users cannot enable crisisAware
    if (crisisAware === true && existing.plan === 'STARTER') {
      return NextResponse.json({ error: 'Crisis Aware requires Pro or Agency plan.' }, { status: 403 })
    }

    // Plan gate: Starter users cannot enable Full Automatic AI replies
    if (aiResponseMode === 'FULL' && existing.plan === 'STARTER') {
      return NextResponse.json({ error: 'Full Automatic requires Pro or Agency plan.' }, { status: 403 })
    }

    const workspace = await prisma.workspace.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(industry !== undefined && { industry }),
        ...(websiteUrl !== undefined && { websiteUrl }),
        ...(clientAccessLevel !== undefined && { clientAccessLevel }),
        ...(aiResponseMode !== undefined && { aiResponseMode }),
        ...(crisisAware !== undefined && { crisisAware: crisisAware === true }),
        ...(timezone !== undefined && { timezone }),
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

    const existing = await getWorkspaceForUser(id, user.id, OWNER_ROLES)
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
      // SEO models -- none of these cascade at the DB level (SeoContent cascades
      // from SeoPage, so deleting SeoPage takes it with it, but SeoConnection and
      // SearchConsoleData each need their own explicit delete here). Missing these
      // three is exactly what made deleting a workspace with any SEO data throw an
      // FK-violation error on workspace.delete() below.
      prisma.seoConnection.deleteMany({ where: { workspaceId: id } }),
      prisma.seoPage.deleteMany({ where: { workspaceId: id } }),
      prisma.searchConsoleData.deleteMany({ where: { workspaceId: id } }),
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
