import type { Comment, Prisma } from '@prisma/client'

/**
 * Per-thread AI reply cap (Workspace.maxAiRepliesPerThread).
 *
 * The problem this solves: a single comment can only ever receive one AI
 * reply (workers/ai-responder.worker.ts claims it RESPONDED atomically), but
 * nothing stopped a *conversation* running away. A customer comments, the AI
 * replies, the customer replies again -- that second comment arrives as a
 * brand new Comment row with status PENDING and earns its own AI reply, with
 * no accounting across the exchange. This caps that.
 *
 * ## Why a thread has to be approximated
 *
 * Comment has no parentCommentId, and NormalizedComment
 * (services/social/provider/types.ts) doesn't carry a parent id either, so
 * the platforms' own threading is discarded at ingestion and simply isn't
 * available to count against. Until that changes, a "thread" is approximated
 * as *one author talking under one post on one connected account*, which is
 * what a customer conversation actually looks like in practice. The known
 * imprecision: if the same person starts two genuinely separate exchanges
 * under the same post, they share one budget. Judged clearly preferable to
 * having no cap at all, and it fails in the safe direction (replies sooner
 * handed to a human, never more replies than configured).
 */

/** Exactly the fields the cap logic reads -- keeps callers from needing a full Comment. */
export type ThreadComment = Pick<
  Comment,
  'socialAccountId' | 'platformPostId' | 'authorName' | 'authorHandle'
>

/** Structural shape of `prisma.comment` that this module needs, so tests can pass a stub. */
export type CommentCountDelegate = {
  count(args: { where: Prisma.CommentWhereInput }): Promise<number>
}

/**
 * The author placeholder services/comments/sync.ts and
 * workers/comment-monitor.worker.ts write when a platform gives us no author
 * name at all (`c.authorName || 'Unknown'`). Critically NOT a real identity:
 * every anonymous commenter across every post lands on this same string, so
 * grouping by it would pool unrelated strangers into one shared conversation
 * budget and silently gag the AI across all of them. Treated as
 * unidentifiable instead -- see buildAuthorFilter.
 */
export const UNIDENTIFIED_AUTHOR_NAME = 'Unknown'

/**
 * Narrows a thread to one participant, or returns null when the author can't
 * be identified well enough to attribute a conversation to them.
 *
 * Prefers authorHandle (a real stable per-platform identifier) and falls back
 * to authorName only when it's a genuine name rather than the 'Unknown'
 * placeholder. Returning null means "don't apply the cap to this comment" --
 * deliberately fail-open here, because the alternative (pooling every
 * anonymous commenter together) would stop the AI replying to unrelated
 * people for reasons no operator could understand from the dashboard.
 */
export function buildAuthorFilter(comment: ThreadComment): Prisma.CommentWhereInput | null {
  const handle = comment.authorHandle?.trim()
  if (handle) return { authorHandle: handle }

  const name = comment.authorName?.trim()
  if (name && name !== UNIDENTIFIED_AUTHOR_NAME) return { authorName: name }

  return null
}

/**
 * The full "same thread, same participant" filter, or null when the cap
 * doesn't apply.
 *
 * platformPostId is included when known. When it's null -- some ingestion
 * paths don't populate it (see Comment.platformPostId being optional) -- the
 * post constraint is dropped rather than matched against null, widening the
 * thread to "this author on this account". That's intentionally the stricter
 * reading: a missing post id must not punch a hole straight through the
 * guardrail, and counting slightly too broadly only ever escalates to a
 * human sooner.
 */
export function buildThreadFilter(comment: ThreadComment): Prisma.CommentWhereInput | null {
  const authorFilter = buildAuthorFilter(comment)
  if (!authorFilter) return null

  return {
    socialAccountId: comment.socialAccountId,
    ...(comment.platformPostId ? { platformPostId: comment.platformPostId } : {}),
    ...authorFilter,
  }
}

export interface AiReplyCapResult {
  /** True when the AI must not reply again in this thread. */
  reached: boolean
  /** AI replies already claimed in this thread. 0 when the cap doesn't apply. */
  repliesSoFar: number
  /** The configured ceiling, echoed back for logging and escalation copy. */
  limit: number
}

/**
 * Whether the AI has used up its replies for this comment's thread.
 *
 * `limit <= 0` means unlimited and short-circuits without touching the
 * database, so the default-off case costs nothing. The count only ever
 * includes comments flagged aiResponded, so human replies through the Inbox
 * never consume the budget.
 *
 * Called before generating a response, not after, so hitting the cap costs no
 * Claude tokens.
 */
export async function checkAiReplyCap(
  db: CommentCountDelegate,
  comment: ThreadComment,
  limit: number
): Promise<AiReplyCapResult> {
  if (!Number.isFinite(limit) || limit <= 0) return { reached: false, repliesSoFar: 0, limit }

  const threadFilter = buildThreadFilter(comment)
  if (!threadFilter) return { reached: false, repliesSoFar: 0, limit }

  const repliesSoFar = await db.count({ where: { ...threadFilter, aiResponded: true } })
  return { reached: repliesSoFar >= limit, repliesSoFar, limit }
}

/**
 * The escalationReason stored on a comment stopped by the cap. Written to the
 * DB and surfaced in the Inbox and the notification, so it states the actual
 * situation a human is being asked to pick up rather than reading as a fault.
 */
export function aiReplyCapEscalationReason(result: AiReplyCapResult): string {
  return `AI reply limit reached for this conversation (${result.repliesSoFar} of ${result.limit}). Handed over for a human reply.`
}
