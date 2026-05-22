import { Worker, Queue } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'

const aiRespondQueue = new Queue('ai-responding', { connection: redis })

const worker = new Worker(
  'comment-monitoring',
  async (job) => {
    const { socialAccountId } = job.data as { socialAccountId: string }

    const account = await prisma.socialAccount.findUnique({
      where:   { id: socialAccountId },
      include: { workspace: true },
    })
    if (!account || !account.isActive) return

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
      }
      // Other platforms: add polling logic here as APIs are onboarded
    } catch (err) {
      console.error(`Failed to fetch comments for account ${socialAccountId}:`, err)
      return
    }

    if (rawComments.length > 0) {
      // Single query to find which platformCommentIds already exist
      const existingIds = await prisma.comment.findMany({
        where: { platformCommentId: { in: rawComments.map(c => c.id) } },
        select: { platformCommentId: true },
      })
      const existingSet = new Set(existingIds.map(c => c.platformCommentId))

      const toInsert = rawComments
        .filter(c => !existingSet.has(c.id))
        .map(c => ({
          workspaceId:       account.workspaceId,
          socialAccountId:   account.id,
          platformCommentId: c.id,
          authorName:        c.from?.name ?? 'Unknown',
          content:           c.message,
          platformCreatedAt: new Date(c.created_time),
          status:            'PENDING' as const,
        }))

      if (toInsert.length > 0) {
        await prisma.comment.createMany({ data: toInsert, skipDuplicates: true })

        const mode = account.workspace.aiResponseMode
        if (mode === 'FULL' || mode === 'DRAFT_APPROVE') {
          const created = await prisma.comment.findMany({
            where: { platformCommentId: { in: toInsert.map(c => c.platformCommentId) } },
            select: { id: true },
          })
          await Promise.all(
            created.map(c =>
              aiRespondQueue.add(
                'generate-response',
                { commentId: c.id, autoPost: mode === 'FULL' },
                { jobId: `respond-${c.id}` }
              )
            )
          )
        }
      }
    }

    await prisma.socialAccount.update({
      where: { id: socialAccountId },
      data:  { lastCommentSyncAt: new Date() },
    })
  },
  { connection: redis, concurrency: 10 }
)

worker.on('failed', (job, err) => {
  console.error(`Comment monitor failed for account ${job?.data.socialAccountId}:`, err)
})

export default worker
