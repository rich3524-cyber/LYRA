import { NextResponse } from 'next/server'
import { z } from 'zod'
import { PostStatus, Platform } from '@prisma/client'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBody, ValidationError } from '@/lib/validate'
import { checkMediaCompatibility, formatCompatibilityIssue } from '@/services/social/media-compatibility'
import { canWrite } from '@/lib/authz'

export const dynamic = 'force-dynamic'

const createPostSchema = z.object({
  workspaceId:   z.string().min(1),
  content:       z.string().min(1),
  platforms:     z.array(z.nativeEnum(Platform)).min(1),
  scheduledAt:   z.string().nullish(),
  mediaUrls:     z.array(z.string()).optional(),
  platformMedia: z.record(z.string(), z.array(z.string())).optional(),
  status:        z.nativeEnum(PostStatus).optional(),
  topic:         z.string().nullish(),
  requiresMedia: z.boolean().optional(),
})


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
        authorId: true,
        content: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        platformPostId: true,
        mediaUrls: true,
        aiGenerated: true,
        failureReason: true,
        requiresMedia: true,
        createdAt: true,
        socialAccount: { select: { platform: true, name: true, platformId: true, adAccountId: true } },
        boost: true,
      },
      orderBy: { createdAt: 'desc' },
      // Safety cap -- the `month` filter naturally bounds calendar-view requests,
      // but callers like the drafts list query by `status` alone with no date
      // range, which had no limit at all before.
      take: 200,
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
    const { workspaceId, content, platforms, scheduledAt, mediaUrls, platformMedia, status, topic, requiresMedia } = await parseBody(req, createPostSchema)

    const ALLOWED_CREATE_STATUSES: PostStatus[] = ['DRAFT', 'SCHEDULED']
    const resolvedStatus: PostStatus = status && ALLOWED_CREATE_STATUSES.includes(status)
      ? status
      : 'DRAFT'

    // Defense-in-depth for the same check the Composer runs client-side before
    // submitting -- catches a known-broken platform/format combo (e.g. a GIF
    // targeting Instagram, which silently fails to publish) before it's queued.
    // Only enforced at SCHEDULED time, not for drafts (media can still change).
    // When platformMedia is provided each platform is checked against its own
    // media rather than the shared set to avoid false positives.
    if (resolvedStatus === 'SCHEDULED') {
      const allIssues: string[] = []
      for (const platform of platforms) {
        const resolved = platformMedia?.[platform]?.length ? platformMedia[platform] : mediaUrls ?? []
        const issues = checkMediaCompatibility(resolved, [platform])
        issues.forEach((issue) => allIssues.push(formatCompatibilityIssue(issue)))
      }
      if (allIssues.length > 0) {
        return NextResponse.json({ error: allIssues.join(' ') }, { status: 422 })
      }
      if (requiresMedia) {
        const anyEmpty = platforms.some((p) => {
          const resolved = platformMedia?.[p]?.length ? platformMedia[p] : mediaUrls ?? []
          return resolved.length === 0
        })
        if (anyEmpty) {
          return NextResponse.json(
            { error: 'This post is awaiting media. Attach an image or video before scheduling.' },
            { status: 422 }
          )
        }
      }
    }

    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
      include: { workspace: { select: { clientAccessLevel: true } } },
    })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Post publishing/scheduling routes through the client approval workflow
    // where it's enabled (parent MCP spec 3.4). A general fix, not
    // MCP-specific -- the same gap existed for the web app, previously
    // papered over by the UI (components/lyra/calendar/*) only ever
    // offering the "correct" status transition to a thoughtful human;
    // nothing server-side enforced it.
    const finalStatus: PostStatus =
      resolvedStatus === 'SCHEDULED' && access.workspace.clientAccessLevel === 'APPROVE'
        ? 'PENDING_APPROVAL'
        : resolvedStatus

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
            mediaUrls: platformMedia?.[account.platform]?.length ? platformMedia[account.platform] : mediaUrls ?? [],
            status: finalStatus,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            topic: topic ?? null,
            requiresMedia: requiresMedia ?? false,
          },
          include: { socialAccount: { select: { platform: true, name: true } } },
        })
      )
    )

    return NextResponse.json(posts, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ValidationError) {
      console.error('POST /api/posts validation failed:', error.issues)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/posts error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
