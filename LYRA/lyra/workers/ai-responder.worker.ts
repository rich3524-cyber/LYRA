import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { generateCommentResponse } from '@/services/ai/response-generator'

const worker = new Worker(
  'ai-responding',
  async (job) => {
    const { commentId, autoPost } = job.data as { commentId: string; autoPost: boolean }

    const comment = await prisma.comment.findUnique({ where: { id: commentId } })
    if (!comment || comment.status === 'ESCALATED' || comment.status === 'RESPONDED') return

    const [brandProfile, guardrails] = await Promise.all([
      prisma.brandProfile.findUnique({ where: { workspaceId: comment.workspaceId } }),
      prisma.guardrail.findMany({ where: { workspaceId: comment.workspaceId } }),
    ])

    const result = await generateCommentResponse(comment, brandProfile, guardrails)

    if (result.shouldEscalate) {
      await prisma.comment.update({
        where: { id: commentId },
        data: {
          status:           'ESCALATED',
          isEscalated:      true,
          escalationReason: result.escalationReason,
        },
      })
      return
    }

    if (autoPost && result.response) {
      // In full-autonomy mode: mark as responded without human review
      await prisma.comment.update({
        where: { id: commentId },
        data: {
          status:        'RESPONDED',
          finalResponse: result.response,
          respondedAt:   new Date(),
        },
      })
      // TODO: publish to platform via social API
    } else {
      await prisma.comment.update({
        where: { id: commentId },
        data: { status: 'AI_DRAFTED', aiDraftResponse: result.response },
      })
    }
  },
  { connection: redis, concurrency: 5 }
)

worker.on('failed', (job, err) => {
  console.error(`AI responder failed for comment ${job?.data.commentId}:`, err)
})

export default worker
