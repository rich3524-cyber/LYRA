import { Worker, Queue } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { detectCrisis } from '@/services/ai/crisis-detector'

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

    // Batch deduplication — 1 query instead of N per comment
    const incomingIds = rawComments.map(c => c.id)
    const existing = await prisma.comment.findMany({
      where:  { socialAccountId: account.id, platformCommentId: { in: incomingIds } },
      select: { platformCommentId: true },
    })
    const existingSet = new Set(existing.map(e => e.platformCommentId))
    const newRaw = rawComments.filter(c => !existingSet.has(c.id))

    if (newRaw.length === 0) return

    // Single bulk insert
    await prisma.comment.createMany({
      data: newRaw.map(c => ({
        workspaceId:       account.workspaceId,
        socialAccountId:   account.id,
        platformCommentId: c.id,
        authorName:        c.from?.name ?? 'Unknown',
        content:           c.message,
        platformCreatedAt: new Date(c.created_time),
        status:            'PENDING' as const,
      })),
      skipDuplicates: true,
    })

    // Fetch the newly created IDs for downstream processing
    const savedComments = await prisma.comment.findMany({
      where:  { socialAccountId: account.id, platformCommentId: { in: newRaw.map(c => c.id) } },
      select: { id: true, content: true },
    })

    const mode = account.workspace.aiResponseMode
    if (mode === 'FULL' || mode === 'DRAFT_APPROVE') {
      await Promise.all(
        savedComments.map(c =>
          aiRespondQueue.add(
            'generate-response',
            { commentId: c.id, autoPost: mode === 'FULL' },
            { jobId: `respond-${c.id}` }
          )
        )
      )
    }

    if (savedComments.length > 0) {
      try {
        // Re-read workspace crisis state — it may have changed since the job started
        const workspaceMeta = await prisma.workspace.findUnique({
          where:  { id: account.workspaceId },
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
