import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteObject } from '@/lib/s3'

export const dynamic = 'force-dynamic'


export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, key } = await req.json()

    if (!workspaceId || !key) {
      return NextResponse.json({ error: 'workspaceId and key required' }, { status: 400 })
    }

    // Prevent cross-workspace key attachment
    if (!key.startsWith(`guidelines/${workspaceId}/`)) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Atomic array push — prevents lost-update race on concurrent uploads
    await prisma.brandProfile.upsert({
      where:  { workspaceId },
      create: { workspaceId, guidelineUrls: [key] },
      update: { guidelineUrls: { push: key } },
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

    // Prevent cross-workspace key deletion
    if (!key.startsWith(`guidelines/${workspaceId}/`)) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Remove from S3
    await deleteObject(key)

    // Atomic array_remove — avoids read-write race with concurrent uploads
    await prisma.$executeRaw`
      UPDATE "BrandProfile"
      SET "guidelineUrls" = array_remove("guidelineUrls", ${key})
      WHERE "workspaceId" = ${workspaceId}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/brand-intelligence/guidelines error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
