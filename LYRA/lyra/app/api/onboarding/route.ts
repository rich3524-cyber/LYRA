import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { addDays } from 'date-fns'
import { checkRateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'
import { parseBody, ValidationError } from '@/lib/validate'

export const dynamic = 'force-dynamic'

const patchOnboardingSchema = z.object({
  websiteUrl:  z.string().nullish(),
  industry:    z.string().nullish(),
  brandBrief:  z.string().nullish(),
  complete:    z.boolean().optional(),
})


export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json()

    const access = await prisma.workspaceAccess.findFirst({
      where: { userId: user.id, workspaceId, role: { in: ['AGENCY_ADMIN', 'AGENCY_MEMBER'] } },
    })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const record = await prisma.onboardingToken.upsert({
      where:  { workspaceId },
      create: { workspaceId, expiresAt: addDays(new Date(), 7) },
      update: { expiresAt: addDays(new Date(), 7), completedAt: null },
    })

    const onboardingUrl = `${process.env.APP_BASE_URL}/onboard/${record.token}`
    return NextResponse.json({ url: onboardingUrl, token: record.token })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/onboarding error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  // Unauthenticated and keyed solely on the token string -- rate-limit by IP so
  // this can't be used to brute-force-guess a valid token (the token's own
  // entropy, see the schema comment on OnboardingToken.token, is the primary
  // defense; this is the secondary one).
  const { allowed } = await checkRateLimit(`onboarding-get:${getClientIp(req)}`, 20, 300)
  if (!allowed) return rateLimitResponse()

  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const record = await prisma.onboardingToken.findUnique({
    where:   { token },
    include: { workspace: { select: { id: true, name: true, websiteUrl: true, industry: true } } },
  })

  if (!record) return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  if (record.expiresAt < new Date()) return NextResponse.json({ error: 'Token expired' }, { status: 410 })

  return NextResponse.json({ workspace: record.workspace, completedAt: record.completedAt })
}

export async function PATCH(req: Request) {
  try {
    const { allowed } = await checkRateLimit(`onboarding-patch:${getClientIp(req)}`, 20, 300)
    if (!allowed) return rateLimitResponse()

    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

    const record = await prisma.onboardingToken.findUnique({ where: { token } })
    if (!record) return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    if (record.expiresAt < new Date()) return NextResponse.json({ error: 'Token expired' }, { status: 410 })

    const { websiteUrl, industry, brandBrief, complete } = await parseBody(req, patchOnboardingSchema)

    // Update workspace fields from onboarding submission
    const workspaceData: Record<string, unknown> = {}
    if (websiteUrl !== undefined) workspaceData.websiteUrl = websiteUrl
    if (industry   !== undefined) workspaceData.industry   = industry

    if (Object.keys(workspaceData).length) {
      await prisma.workspace.update({ where: { id: record.workspaceId }, data: workspaceData })
    }

    // Store brand brief in BrandProfile if provided
    if (brandBrief) {
      await prisma.brandProfile.upsert({
        where:  { workspaceId: record.workspaceId },
        create: { workspaceId: record.workspaceId, voiceSummary: brandBrief },
        update: { voiceSummary: brandBrief },
      })
    }

    if (complete) {
      await prisma.onboardingToken.update({ where: { token }, data: { completedAt: new Date() } })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('PATCH /api/onboarding validation failed:', error.issues)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('PATCH /api/onboarding error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
