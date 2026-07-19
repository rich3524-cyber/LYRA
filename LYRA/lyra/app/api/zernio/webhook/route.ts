import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyZernioSignature } from '@/services/social/webhook-verify'
import { toNormalizedComment } from '@/services/social/provider/mappers'
import { aiRespondQueue } from '@/lib/queues'

export const dynamic = 'force-dynamic'

interface ZernioWebhookEvent {
  id: string
  event: string
  comment?: {
    id: string
    platformPostId?: string
    author?: { id?: string; name?: string; username?: string; isOwner?: boolean }
    text?: string
    createdAt?: string
  }
  account?: {
    id?: string
    accountId?: string
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
        // Confirmed 17 Jul 2026 against a real delivery: comments are an "inbox
        // event" per Zernio's docs, which carry the tenant key as a top-level
        // `account` object -- never nested inside `comment`. The original
        // speculative `comment.accountId` read (written before any live delivery
        // was seen) was always undefined, so every comment silently failed to
        // route and got ack'd without ever being saved. Docs show two slightly
        // different field names across examples (`account.id` on the
        // message.received sample, `account.accountId` elsewhere) -- accept either.
        const zernioAccountId = payload.account?.id ?? payload.account?.accountId
        if (!zernioAccountId) {
          console.error(`comment.received event ${payload.id} has no account.id/accountId — cannot route`)
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

        // Skip our own AI-posted replies coming back as "new" comments -- the
        // platform's webhook fires for any comment on a tracked post, including
        // ones we posted ourselves via replyToComment. Confirmed live 17 Jul 2026:
        // every auto-reply re-appeared as a fresh incoming comment moments later,
        // which Claude then (inconsistently) either escalated or could have
        // replied to again, risking a genuine reply-to-self loop. Prefer Zernio's
        // own isOwner flag when present (confirmed to exist on their REST
        // comment-list responses); fall back to matching the author's platform id
        // or handle against our own connected account, which works even if a
        // given webhook delivery omits isOwner.
        const author = payload.comment.author
        const isSelfComment =
          author?.isOwner === true ||
          (!!author?.id && author.id === account.platformId) ||
          (!!author?.username && author.username.toLowerCase() === account.handle.toLowerCase())
        if (isSelfComment) break

        // Guard this the same way as the accountId check above: platformPostId is
        // documented as required on this event, but if a real delivery ever omits
        // it, skip-and-ack now rather than persisting a comment with no post
        // reference -- one that would fail loudly (but confusingly, hours later)
        // the first time someone tries to reply to it.
        if (!payload.comment.platformPostId) {
          console.error(`comment.received event ${payload.id} has no platformPostId — cannot route`)
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
        // than creating a duplicate. Duplicate auto-replies on a redelivered event
        // are prevented not by BullMQ's jobId (which only dedupes while the prior
        // job is still retained in Redis) but by ai-responder.worker.ts's own
        // early-exit on comment.status === 'RESPONDED'/'ESCALATED' -- that guard is
        // the real safety net for "don't double-post," not the jobId.
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
    // A genuinely unexpected failure (DB/Redis blip, malformed data that throws
    // on write, etc.) -- NOT one of the deliberate skip-and-ack cases above,
    // which all `break` out of the switch without throwing. Return 500 so
    // Zernio's retry policy actually re-delivers (the upsert above is idempotent,
    // so a retry is safe) and so a persistent failure surfaces in Zernio's own
    // webhook-delivery-failure monitoring instead of silently vanishing behind
    // an ack'd 200.
    console.error(`Zernio webhook processing error (event ${payload.id}, type ${payload.event}):`, error)
    return NextResponse.json({ error: 'Internal error processing webhook' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
