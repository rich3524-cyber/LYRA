import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/s3'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, key } = await req.json()

    if (!workspaceId || !key) {
      return NextResponse.json({ error: 'workspaceId and key required' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Upsert the BrandProfile row and append the key
    const existing    = await prisma.brandProfile.findUnique({ where: { workspaceId } })
    const currentUrls = existing?.guidelineUrls ?? []

    await prisma.brandProfile.upsert({
      where:  { workspaceId },
      create: { workspaceId, guidelineUrls: [key] },
      update: { guidelineUrls: [...currentUrls, key] },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/brand-intelligence/guidelines error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, key } = await req.json()

    if (!workspaceId || !key) {
      return NextResponse.json({ error: 'workspaceId and key required' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Remove from S3
    await deleteObject(key)

    // Remove from BrandProfile.guidelineUrls
    const profile = await prisma.brandProfile.findUnique({ where: { workspaceId } })
    if (profile) {
      await prisma.brandProfile.update({
        where: { workspaceId },
        data:  { guidelineUrls: profile.guidelineUrls.filter((u) => u !== key) },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/brand-intelligence/guidelines error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
