import { NextResponse } from 'next/server'
import { Queue } from 'bullmq'
import { redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { verifyZernioSignature } from '@/services/social/webhook-verify'
import { toNormalizedComment } from '@/services/social/provider/mappers'

export const dynamic = 'force-dynamic'

const aiRespondQueue = new Queue('ai-responding', { connection: redis })

interface ZernioWebhookEvent {
  id: string
  event: string
  comment?: {
    id: string
    platformPostId: string
    accountId?: string
    author?: { name?: string; username?: string }
    text?: string
    createdAt?: string
  }
  account?: {
    accountId: string
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('X-Zernio-Signature') ?? req.headers.get('X-Late-Signature')
  const secret = process.env.ZERNIO_WEBHOOK_SECRET

  if (!secret) {
    console.error('ZERNIO_WEBHOOK_SECRET is not set — rejecting webhook')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }
  if (!verifyZernioSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: ZernioWebhookEvent
  try {
    payload = JSON.parse(rawBody) as ZernioWebhookEvent
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    switch (payload.event) {
      case 'comment.received': {
        if (!payload.comment) break
        // TODO(phase-4-live-verify): comment.accountId's exact placement in the
        // real payload wasn't confirmed against a live delivery during planning
        // (docs snippet truncated). Adjust here if a real webhook shows it
        // living elsewhere (e.g. a top-level `account.accountId` block instead).
        const zernioAccountId = payload.comment.accountId
        if (!zernioAccountId) {
          console.error(`comment.received event ${payload.id} has no accountId — cannot route`)
          break
        }

        const account = await prisma.socialAccount.findFirst({
          where: { zernioAccountId },
          include: { workspace: true },
        })
        if (!account) {
          console.error(`comment.received event ${payload.id}: no SocialAccount for zernioAccountId ${zernioAccountId}`)
          break
        }

        const normalized = toNormalizedComment({
          id: payload.comment.id,
          platformPostId: payload.comment.platformPostId,
          author: payload.comment.author,
          text: payload.comment.text,
          createdAt: payload.comment.createdAt ?? new Date().toISOString(),
        })

        // Idempotent by construction: @@unique([socialAccountId, platformCommentId])
        // means a retried delivery for the same comment updates the same row rather
        // than creating a duplicate, and the BullMQ jobId below is deterministic
        // per comment id, so a duplicate enqueue is a no-op at the queue level too.
        const comment = await prisma.comment.upsert({
          where: {
            socialAccountId_platformCommentId: {
              socialAccountId: account.id,
              platformCommentId: normalized.externalId,
            },
          },
          create: {
            workspaceId: account.workspaceId,
            socialAccountId: account.id,
            platformCommentId: normalized.externalId,
            platformPostId: normalized.postExternalId,
            authorName: normalized.authorName || 'Unknown',
            authorHandle: normalized.authorHandle,
            content: normalized.text,
            platformCreatedAt: normalized.createdAt,
            status: 'PENDING',
          },
          update: {
            content: normalized.text,
          },
        })

        const mode = account.workspace.aiResponseMode
        if (mode === 'FULL' || mode === 'DRAFT_APPROVE') {
          await aiRespondQueue.add(
            'generate-response',
            { commentId: comment.id, autoPost: mode === 'FULL' },
            { jobId: `respond-${comment.id}` }
          )
        }
        break
      }

      case 'account.disconnected': {
        if (!payload.account?.accountId) break
        await prisma.socialAccount.updateMany({
          where: { zernioAccountId: payload.account.accountId },
          data: { isActive: false },
        })
        break
      }

      default:
        // Unhandled event type — ack it anyway so Zernio doesn't retry forever.
        break
    }
  } catch (error) {
    // Log but still return 200 -- Zernio's retry policy would otherwise keep
    // re-delivering an event that fails for a reason a retry can't fix (e.g. a
    // permanently missing SocialAccount), and idempotent upserts make a retry
    // safe if the cause WAS transient (e.g. a DB blip).
    console.error(`Zernio webhook processing error (event ${payload.id}, type ${payload.event}):`, error)
  }

  return NextResponse.json({ ok: true })
}
