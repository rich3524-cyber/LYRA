import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { addDays } from 'date-fns'

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
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const record = await prisma.onboardingToken.findUnique({ where: { token } })
  if (!record) return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  if (record.expiresAt < new Date()) return NextResponse.json({ error: 'Token expired' }, { status: 410 })

  const body = await req.json()

  // Update workspace fields from onboarding submission
  const { websiteUrl, industry, brandBrief, complete } = body
  const workspaceData: Record<string, unknown> = {}
  if (websiteUrl  !== undefined) workspaceData.websiteUrl  = websiteUrl
  if (industry    !== undefined) workspaceData.industry    = industry

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
}
