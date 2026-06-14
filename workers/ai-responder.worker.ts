import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { generateCommentResponse } from '@/services/ai/response-generator'
import { decrypt } from '@/lib/encrypt'
import { replyToComment } from '@/services/social/facebook'

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
      try {
        const account = await prisma.socialAccount.findUnique({
          where: { id: comment.socialAccountId },
        })
        if (account && (account.platform === 'FACEBOOK' || account.platform === 'INSTAGRAM')) {
          const token = decrypt(account.accessToken)
          await replyToComment(comment.platformCommentId, result.response, token)
          await prisma.comment.update({
            where: { id: commentId },
            data:  {
              status:        'RESPONDED',
              finalResponse: result.response,
              respondedAt:   new Date(),
            },
          })
        } else {
          // Platform not supported for auto-reply — fall back to draft for human review
          await prisma.comment.update({
            where: { id: commentId },
            data:  { status: 'AI_DRAFTED', aiDraftResponse: result.response },
          })
        }
      } catch (err) {
        console.error(`Auto-reply failed for comment ${commentId}:`, err)
        // Fall back to draft so it appears in Pending tab for manual approval
        await prisma.comment.update({
          where: { id: commentId },
          data:  { status: 'AI_DRAFTED', aiDraftResponse: result.response },
        })
      }
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
