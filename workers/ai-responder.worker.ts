import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { generateCommentResponse } from '@/services/ai/response-generator'
import { getValidToken } from '@/lib/token-refresh'

const worker = new Worker(
  'ai-responding',
  async (job) => {
    const { commentId } = job.data as { commentId: string; autoPost: boolean }

    const comment = await prisma.comment.findUnique({
      where:   { id: commentId },
      include: { socialAccount: true },
    })
    if (!comment || comment.status === 'ESCALATED' || comment.status === 'RESPONDED') return

    // Re-derive autoPost from the live DB — never trust the job payload for autonomy level
    const workspace = await prisma.workspace.findUnique({
      where:  { id: comment.workspaceId },
      select: { aiResponseMode: true, plan: true },
    })
    if (!workspace) return

    // Plan gate — Full Autonomy requires Agency plan
    const canAutoPost =
      workspace.aiResponseMode === 'FULL' && workspace.plan === 'AGENCY'
    const canDraft =
      workspace.aiResponseMode !== 'OFF' && workspace.plan !== 'STARTER'

    if (!canDraft) return

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

    if (!result.response) return

    if (canAutoPost && comment.socialAccount) {
      // Full Autonomy — post directly to the platform with no human review
      try {
        const token    = await getValidToken(comment.socialAccount)
        const platform = comment.socialAccount.platform

        if (platform === 'FACEBOOK' || platform === 'INSTAGRAM') {
          const res = await fetch(
            `https://graph.facebook.com/v19.0/${comment.platformCommentId}/comments`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ message: result.response, access_token: token }),
            }
          )
          if (!res.ok) throw new Error(`Graph API error ${res.status}`)
        } else if (platform === 'GOOGLE_BUSINESS') {
          // Google Business Profile review reply
          const locationName = comment.socialAccount.platformId
          const res = await fetch(
            `https://mybusiness.googleapis.com/v4/${locationName}/reviews/${comment.platformCommentId}/reply`,
            {
              method:  'PUT',
              headers: {
                Authorization:  `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ comment: result.response }),
            }
          )
          if (!res.ok) throw new Error(`GBP API error ${res.status}`)
        } else {
          // Platform not yet supported for auto-reply — fall back to draft
          await prisma.comment.update({
            where: { id: commentId },
            data:  { status: 'AI_DRAFTED', aiDraftResponse: result.response },
          })
          return
        }

        await prisma.comment.update({
          where: { id: commentId },
          data: {
            status:        'RESPONDED',
            finalResponse: result.response,
            respondedAt:   new Date(),
          },
        })
      } catch (err) {
        console.error(`Auto-reply failed for comment ${commentId}:`, err)
        // Fall back to draft so the response is not lost
        await prisma.comment.update({
          where: { id: commentId },
          data:  { status: 'AI_DRAFTED', aiDraftResponse: result.response },
        })
      }
    } else {
      // Draft + Approve — human reviews before posting
      await prisma.comment.update({
        where: { id: commentId },
        data:  { status: 'AI_DRAFTED', aiDraftResponse: result.response },
      })
    }
  },
  { connection: redis, concurrency: 5 }
)

worker.on('failed', (job, err) => {
  console.error(`AI responder failed for comment ${job?.data.commentId}:`, err)
})

export default worker
