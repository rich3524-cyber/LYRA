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

    for (const comment of rawComments) {
      const existing = await prisma.comment.findFirst({
        where: { platformCommentId: comment.id },
      })
      if (existing) continue

      const newComment = await prisma.comment.create({
        data: {
          workspaceId:       account.workspaceId,
          socialAccountId:   account.id,
          platformCommentId: comment.id,
          authorName:        comment.from?.name ?? 'Unknown',
          content:           comment.message,
          platformCreatedAt: new Date(comment.created_time),
          status:            'PENDING',
        },
      })

      const mode = account.workspace.aiResponseMode
      if (mode === 'FULL' || mode === 'DRAFT_APPROVE') {
        await aiRespondQueue.add(
          'generate-response',
          { commentId: newComment.id, autoPost: mode === 'FULL' },
          { jobId: `respond-${newComment.id}` }
        )
      }
    }
  },
  { connection: redis, concurrency: 10 }
)

worker.on('failed', (job, err) => {
  console.error(`Comment monitor failed for account ${job?.data.socialAccountId}:`, err)
})

export default worker
