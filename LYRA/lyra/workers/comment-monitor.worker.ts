import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { detectCrisis } from '@/services/ai/crisis-detector'
import * as linkedin from '@/services/social/linkedin'
import { aiRespondQueue } from '@/lib/queues'
import { getProvider } from '@/services/social/provider'
import { ZernioApiError } from '@/services/social/zernio-client'

interface NormalizedRow {
  platformCommentId: string
  platformPostId?: string
  authorName: string
  content: string
  platformCreatedAt: Date
}

const worker = new Worker(
  'comment-monitoring',
  async (job) => {
    const { socialAccountId } = job.data as { socialAccountId: string }

    const account = await prisma.socialAccount.findUnique({
      where:   { id: socialAccountId },
      include: { workspace: true },
    })
    if (!account || !account.isActive) return

    let normalizedRows: NormalizedRow[] = []

    // Zernio-connected accounts (the default connection method going forward)
    // never have a local accessToken -- Zernio holds the platform credentials
    // on their own side. This fell through to the accessToken check below and
    // was silently skipped on every run, meaning this cron never ingested a
    // single comment for any Zernio account -- confirmed live 21 Jul 2026 via
    // production logs showing the identical skip firing on the manual sync
    // route. Route these through the same provider abstraction
    // publish()/replyToComment() already use instead.
    if (account.provider === 'ZERNIO' && account.zernioAccountId != null) {
      try {
        const normalized = await getProvider(account).fetchRecentComments(account)
        // Mirror the manual sync route's self-comment filter (and the webhook's
        // isOwner/id-based one) -- this branch had NO self-comment filtering at
        // all, unlike the other two ingestion paths. Confirmed live 2026-07-22:
        // an AI-drafted reply the account itself posted got picked back up by
        // this cron as a "new" incoming comment, and the AI drafted a reply to
        // its own reply. This cron runs automatically and far more often than
        // someone clicking the manual Sync button, so it's the likeliest path
        // for a self-comment to slip through uncaught.
        const selfName   = account.name?.toLowerCase()
        const selfHandle = account.handle?.toLowerCase()
        const incoming   = normalized.filter((c) => {
          if (selfName   && c.authorName?.toLowerCase()   === selfName)   return false
          if (selfHandle && c.authorHandle?.toLowerCase() === selfHandle) return false
          return true
        })
        normalizedRows = incoming.map((c) => ({
          platformCommentId: c.externalId,
          platformPostId:    c.postExternalId,
          authorName:        c.authorName || 'Unknown',
          content:           c.text,
          platformCreatedAt: c.createdAt,
        }))
      } catch (err) {
        // Some platforms (e.g. TikTok) don't support comments at all via Zernio --
        // a permanent, expected condition for that account, not a transient
        // failure worth alerting on. Confirmed live 2026-07-21: this was logging
        // as an error on every single run for every TikTok account.
        if (err instanceof ZernioApiError && (err.body as { code?: string } | undefined)?.code === 'PLATFORM_NOT_SUPPORTED') {
          return
        }
        console.error(`Comment monitor: Zernio fetch failed for account ${socialAccountId}:`, err)
        return
      }
    } else {
      if (!account.accessToken) {
        console.error(`Comment monitor: account ${socialAccountId} has no access token — skipping`)
        return
      }

      const token    = decrypt(account.accessToken)
      const platform = account.platform

      let rawComments: Array<{ id: string; message: string; from?: { name?: string; id?: string }; created_time: string }> = []

      try {
        if (platform === 'FACEBOOK') {
          const res  = await fetch(
            `https://graph.facebook.com/v19.0/${account.platformId}/feed?fields=comments{message,from,created_time}&access_token=${token}`
          )
          const data = await res.json() as { data?: Array<{ comments?: { data?: typeof rawComments } }> }
          for (const post of data.data ?? []) {
            rawComments = rawComments.concat(post.comments?.data ?? [])
          }
        } else if (platform === 'INSTAGRAM') {
          const res  = await fetch(
            `https://graph.facebook.com/v19.0/${account.platformId}/media?fields=comments{text,username,timestamp}&access_token=${token}`
          )
          const data = await res.json() as { data?: Array<{ comments?: { data?: Array<{ id: string; text: string; username?: string; timestamp: string }> } }> }
          for (const media of data.data ?? []) {
            for (const c of media.comments?.data ?? []) {
              rawComments.push({ id: c.id, message: c.text, from: { name: c.username }, created_time: c.timestamp })
            }
          }
        } else if (platform === 'LINKEDIN') {
          // Fetch recent org posts then gather comments.
          // platformCommentId = full comment URN encodes post context for later replies.
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
        // Other platforms: add polling logic here as APIs are onboarded
      } catch (err) {
        console.error(`Failed to fetch comments for account ${socialAccountId}:`, err)
        return
      }

      normalizedRows = rawComments.map((comment) => ({
        platformCommentId: comment.id,
        authorName:        comment.from?.name ?? 'Unknown',
        content:           comment.message,
        platformCreatedAt: new Date(comment.created_time),
      }))
    }

    // createManyAndReturn + skipDuplicates replaces a per-comment findFirst-then-create
    // pair (an N+1 that ran 2 queries per fetched comment). skipDuplicates relies on the
    // @@unique([socialAccountId, platformCommentId]) constraint and also closes the race
    // between two overlapping monitor runs for the same account: only rows this call
    // actually inserted come back, so a comment concurrently inserted by another run is
    // silently excluded here rather than double-queued for an AI response below.
    const createdComments = normalizedRows.length === 0 ? [] : await prisma.comment.createManyAndReturn({
      data: normalizedRows.map((row) => ({
        workspaceId:       account.workspaceId,
        socialAccountId:   account.id,
        platformCommentId: row.platformCommentId,
        platformPostId:    row.platformPostId,
        authorName:        row.authorName,
        content:           row.content,
        platformCreatedAt: row.platformCreatedAt,
        status:            'PENDING' as const,
      })),
      skipDuplicates: true,
    })

    const savedComments = createdComments.map((c) => ({ id: c.id, content: c.content }))

    const mode = account.workspace.aiResponseMode
    if (mode === 'FULL' || mode === 'DRAFT_APPROVE') {
      await Promise.all(createdComments.map((newComment) =>
        aiRespondQueue.add(
          'generate-response',
          { commentId: newComment.id, autoPost: mode === 'FULL' },
          { jobId: `respond-${newComment.id}` }
        )
      ))
    }

    if (savedComments.length > 0) {
      try {
        const workspaceMeta = await prisma.workspace.findUnique({
          where: { id: account.workspaceId },
          select: { crisisAware: true, crisisActive: true },
        })

        if (workspaceMeta?.crisisAware && !workspaceMeta.crisisActive) {
          const result = await detectCrisis(account.workspaceId, savedComments)

          if (result.triggered) {
            await prisma.$transaction([
              prisma.workspace.update({
                where: { id: account.workspaceId },
                data: { crisisActive: true, crisisTriggeredAt: new Date() },
              }),
              prisma.crisisEvent.create({
                data: {
                  workspaceId: account.workspaceId,
                  triggerType: result.type,
                  commentIds:  result.commentIds,
                },
              }),
            ])
            console.log(`Crisis triggered for workspace ${account.workspaceId}: ${result.type}`)
          }
        }
      } catch (err) {
        console.error(`Crisis detection failed for workspace ${account.workspaceId}:`, err)
        // Continue — do not crash the job
      }
    }
  },
  { connection: redis, concurrency: 10 }
)

worker.on('failed', (job, err) => {
  console.error(`Comment monitor failed for account ${job?.data.socialAccountId}:`, err)
})

export default worker
