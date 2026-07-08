import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import * as linkedin from '@/services/social/linkedin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json() as { workspaceId: string }
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const accounts = await prisma.socialAccount.findMany({
      where: { workspaceId, isActive: true, platform: { in: ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN'] } },
      select: { id: true, platform: true, platformId: true, accessToken: true },
    })

    let newCount = 0

    for (const account of accounts) {
      if (!account.accessToken) {
        console.error(`Skipping comment sync for account ${account.id} — no access token`)
        continue
      }
      const token = decrypt(account.accessToken)

      type RawComment = { id: string; message: string; from?: { name?: string }; created_time: string }
      let rawComments: RawComment[] = []

      try {
        if (account.platform === 'FACEBOOK') {
          const res = await fetch(
            `https://graph.facebook.com/v19.0/${account.platformId}/feed?fields=comments{message,from,created_time}&limit=25&access_token=${token}`
          )
          const data = await res.json() as { data?: Array<{ comments?: { data?: RawComment[] } }> }
          for (const post of data.data ?? []) {
            rawComments = rawComments.concat(post.comments?.data ?? [])
          }
        } else if (account.platform === 'INSTAGRAM') {
          const res = await fetch(
            `https://graph.facebook.com/v19.0/${account.platformId}/media?fields=comments{text,username,timestamp}&limit=25&access_token=${token}`
          )
          const data = await res.json() as { data?: Array<{ comments?: { data?: Array<{ id: string; text: string; username?: string; timestamp: string }> } }> }
          for (const media of data.data ?? []) {
            for (const c of media.comments?.data ?? []) {
              rawComments.push({ id: c.id, message: c.text, from: { name: c.username }, created_time: c.timestamp })
            }
          }
        } else if (account.platform === 'LINKEDIN') {
          // Fetch recent org posts then gather comments on each.
          // platformCommentId for LinkedIn = full comment URN (encodes post context for replies).
          const posts = await linkedin.getOrgPosts(token, account.platformId)
          for (const post of posts.slice(0, 10)) {
            const comments = await linkedin.getPostComments(token, post.urn)
            for (const c of comments) {
              rawComments.push({
                id:           c.commentUrn,
                message:      c.text,
                from:         { name: 'LinkedIn Member' },
                created_time: new Date(c.createdAt).toISOString(),
              })
            }
          }
        }
      } catch {
        continue
      }

      for (const comment of rawComments) {
        const exists = await prisma.comment.findFirst({
          where: { socialAccountId: account.id, platformCommentId: comment.id },
        })
        if (exists) continue
        await prisma.comment.create({
          data: {
            workspaceId,
            socialAccountId:   account.id,
            platformCommentId: comment.id,
            authorName:        comment.from?.name ?? 'Unknown',
            content:           comment.message,
            platformCreatedAt: new Date(comment.created_time),
            status:            'PENDING',
          },
        })
        newCount++
      }
    }

    return NextResponse.json({ synced: newCount })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/comments/sync error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
