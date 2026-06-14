import { NextResponse } from 'next/server'
import { PostStatus } from '@prisma/client'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'


export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')
    const month = searchParams.get('month')
    const statusParam = searchParams.get('status')
    const status = statusParam && (Object.values(PostStatus) as string[]).includes(statusParam)
      ? (statusParam as PostStatus)
      : undefined

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let scheduledAtFilter: { gte: Date; lt: Date } | undefined
    if (month) {
      const [year, mon] = month.split('-').map(Number)
      scheduledAtFilter = {
        gte: new Date(year, mon - 1, 1),
        lt: new Date(year, mon, 1),
      }
    }

    const posts = await prisma.post.findMany({
      where: {
        workspaceId,
        ...(scheduledAtFilter ? { scheduledAt: scheduledAtFilter } : {}),
        ...(status ? { status } : {}),
      },
      select: {
        id: true,
        content: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        platformPostId: true,
        mediaUrls: true,
        aiGenerated: true,
        createdAt: true,
        socialAccount: { select: { platform: true, name: true, platformId: true, adAccountId: true } },
        boost: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(posts)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/posts error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { workspaceId, content, platforms, scheduledAt, mediaUrls, status, topic } = body

    if (!workspaceId || !content?.trim() || !Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json({ error: 'workspaceId, content and platforms required' }, { status: 400 })
    }

    const ALLOWED_CREATE_STATUSES: PostStatus[] = ['DRAFT', 'SCHEDULED']
    const resolvedStatus: PostStatus = ALLOWED_CREATE_STATUSES.includes(status)
      ? (status as PostStatus)
      : 'DRAFT'

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Find connected social accounts for the requested platforms
    const socialAccounts = await prisma.socialAccount.findMany({
      where: {
        workspaceId,
        platform: { in: platforms },
        isActive: true,
      },
      select: { id: true, platform: true },
    })

    if (socialAccounts.length === 0) {
      return NextResponse.json({ error: 'No connected accounts for selected platforms' }, { status: 400 })
    }

    // Create one Post per social account
    const posts = await prisma.$transaction(
      socialAccounts.map((account) =>
        prisma.post.create({
          data: {
            workspaceId,
            socialAccountId: account.id,
            authorId: user.id,
            content: content.trim(),
            mediaUrls: mediaUrls ?? [],
            status: resolvedStatus,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            topic: topic ?? null,
          },
        })
      )
    )

    return NextResponse.json(posts, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/posts error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
