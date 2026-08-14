import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ClientAccess } from '@prisma/client'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PLANS } from '@/lib/stripe'
import { parseBody, ValidationError } from '@/lib/validate'

export const dynamic = 'force-dynamic'

// name's emptiness/whitespace-only check stays a manual business-rule check
// below (matching the existing 'Name required' error exactly) rather than
// being folded into the schema -- only the shape (string vs. non-string) is
// enforced here. clientAccessLevel controls what a client-role user can see
// and do on this workspace, so an invalid value must be rejected rather than
// passed through to Prisma, which would previously throw a raw 500.
const createWorkspaceSchema = z.object({
  name:              z.string(),
  industry:          z.string().nullish(),
  websiteUrl:        z.string().nullish(),
  clientAccessLevel: z.nativeEnum(ClientAccess).optional(),
})


export async function GET() {
  try {
    const user = await requireAuth()
    const workspaces = await prisma.workspace.findMany({
      where: {
        access: { some: { userId: user.id } },
      },
      select: {
        id: true,
        name: true,
        industry: true,
        clientAccessLevel: true,
        aiResponseMode: true,
        plan: true,
        access: { where: { userId: user.id }, select: { role: true } },
        socialAccounts: { where: { isActive: true }, select: { platform: true } },
      },
      orderBy: { name: 'asc' },
    })

    const shaped = workspaces.map(({ access, socialAccounts, ...w }) => ({
      ...w,
      role: access[0]?.role ?? null,
      platforms: socialAccounts.map((sa) => sa.platform),
    }))

    return NextResponse.json(shaped)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/workspaces error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { name, industry, websiteUrl, clientAccessLevel } = await parseBody(req, createWorkspaceSchema)

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }

    // Plan limit + plan sync -- previously absent, so any authenticated user
    // could create unlimited workspaces, and every new workspace started on
    // the schema default STARTER regardless of the paying agency's actual
    // plan (until an unrelated Stripe webhook happened to fire a fan-out and
    // fix it). Resolved via User.agencyId (not Workspace.agencyId, which the
    // real signup/webhook flow never populates -- see
    // app/api/stripe/webhook/route.ts). A user with no agency yet (no billing
    // relationship established) is let through with the schema default --
    // this is the pre-checkout edge case, not the abuse case this targets.
    const agency = user.agencyId
      ? await prisma.agency.findUnique({ where: { id: user.agencyId }, select: { plan: true } })
      : null

    if (agency) {
      const limit = PLANS[agency.plan]?.workspaces ?? PLANS.STARTER.workspaces
      if (limit !== -1) {
        const currentCount = await prisma.workspace.count({
          where: { access: { some: { user: { agencyId: user.agencyId } } } },
        })
        if (currentCount >= limit) {
          return NextResponse.json(
            { error: `Your ${agency.plan.toLowerCase()} plan allows up to ${limit} workspace${limit === 1 ? '' : 's'}. Upgrade to add more.` },
            { status: 403 }
          )
        }
      }
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        industry,
        websiteUrl,
        agencyId:          user.agencyId ?? undefined,
        plan:              agency?.plan,
        clientAccessLevel: clientAccessLevel ?? 'NONE',
        access: {
          create: { userId: user.id, role: 'AGENCY_ADMIN' },
        },
      },
    })

    return NextResponse.json(workspace, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ValidationError) {
      console.error('POST /api/workspaces validation failed:', error.issues)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/workspaces error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
