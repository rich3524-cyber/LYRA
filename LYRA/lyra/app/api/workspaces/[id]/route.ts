import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ClientAccess, Autonomy, type UserRole } from '@prisma/client'
import { parseBody, ValidationError } from '@/lib/validate'

// Settings changes and deletion are owner-level actions -- previously gated on
// mere membership, so any role including a read-only CLIENT_VIEW could delete
// or reconfigure the whole workspace. GET (viewing) intentionally stays
// membership-only; only PATCH/DELETE pass `roles`.
const OWNER_ROLES: UserRole[] = ['AGENCY_ADMIN', 'SMB_OWNER']

// approvalSlaHours/approvalSlaUnscheduledHours keep their existing manual
// SLA_BOUNDS check below (whole hours, 1-720) with its field-specific error
// message untouched -- the schema here only guarantees they arrive as
// *numbers* (not a string/object/array, which previously reached
// Number.isInteger() safely anyway but would have hit Prisma raw on some
// other malformed shape downstream). clientAccessLevel and aiResponseMode
// gate real authorization/plan behavior (what a CLIENT_VIEW user can do;
// whether AI replies autonomously) so an invalid value must be rejected
// rather than passed through to Prisma, which previously threw a raw 500 on
// an enum violation.
const patchWorkspaceSchema = z.object({
  name:                        z.string().optional(),
  industry:                    z.string().nullish(),
  websiteUrl:                  z.string().nullish(),
  clientAccessLevel:           z.nativeEnum(ClientAccess).optional(),
  aiResponseMode:              z.nativeEnum(Autonomy).optional(),
  crisisAware:                 z.boolean().optional(),
  timezone:                    z.string().optional(),
  approvalSlaHours:            z.number().optional(),
  approvalSlaUnscheduledHours: z.number().optional(),
})

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

    const {
      name, industry, websiteUrl, clientAccessLevel, aiResponseMode, crisisAware, timezone,
      approvalSlaHours, approvalSlaUnscheduledHours,
    } = await parseBody(req, patchWorkspaceSchema)

    // Approval SLA thresholds are whole hours within a sane range. Validated
    // rather than passed through: these are Int columns, so a non-integer or a
    // string would be a Prisma-level 500, and a negative or absurd value would
    // silently make the SLA either fire on everything or never fire at all.
    const SLA_BOUNDS: Record<string, [number, number]> = {
      approvalSlaHours:            [1, 720],
      approvalSlaUnscheduledHours: [1, 720],
    }
    for (const [field, value] of Object.entries({ approvalSlaHours, approvalSlaUnscheduledHours })) {
      if (value === undefined) continue
      const [min, max] = SLA_BOUNDS[field]
      if (!Number.isInteger(value) || value < min || value > max) {
        return NextResponse.json(
          { error: `${field} must be a whole number of hours between ${min} and ${max}.` },
          { status: 400 }
        )
      }
    }

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
        ...(approvalSlaHours !== undefined && { approvalSlaHours }),
        ...(approvalSlaUnscheduledHours !== undefined && { approvalSlaUnscheduledHours }),
      },
    })

    return NextResponse.json(workspace)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ValidationError) {
      console.error('PATCH /api/workspaces/[id] validation failed:', error.issues)
      return NextResponse.json({ error: error.message }, { status: 400 })
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
