import type { NormalizedComment, NormalizedReview } from './types'

/**
 * One comment as Zernio's getPostComments actually returns it, captured from
 * a live Instagram response on 2026-11-07.
 *
 * The previous interface here was written speculatively, alongside a note in
 * zernio.ts to "verify this against a live Zernio account when
 * fetchRecentComments is actually wired up" that was never acted on before
 * it was wired up. Every field name except `id` was wrong:
 *
 *     assumed           actual
 *     text              message
 *     createdAt         createdTime
 *     author            from
 *     platformPostId    absent -- only the caller knows the post id
 *
 * The call site casts the raw value into this interface, so TypeScript had
 * no way to catch it. `raw.createdAt` was therefore always undefined,
 * `new Date(undefined)` is Invalid Date, Prisma rejects that, and because
 * comments persist via createManyAndReturn one bad row failed the entire
 * batch and took the job down with it. That is what stopped comment
 * ingestion between 24 Aug and 7 Nov 2026.
 */
interface RawZernioComment {
  id: string
  message?: string
  createdTime?: string
  from?: { id?: string; name?: string; username?: string; isOwner?: boolean }
}

interface RawZernioReview {
  reviewId: string
  starRating?: number
  comment?: string
  reviewer?: { displayName?: string }
  createTime: string
}

/**
 * Returns null when the comment carries no usable timestamp.
 *
 * platformCreatedAt is non-nullable in the schema, so the alternatives were
 * inventing a timestamp or failing the row. Inventing one would quietly
 * misorder a customer conversation and mislead the per-thread reply cap;
 * failing the row is what cost 75 days of ingestion. Dropping it is the only
 * option that neither fabricates data nor takes the batch down, and the
 * caller logs each one so it is visible rather than silent.
 *
 * postExternalId is a parameter because the comment payload does not carry
 * it -- only the loop in fetchRecentComments knows which post it fetched.
 */
export function toNormalizedComment(
  raw: RawZernioComment,
  postExternalId: string
): NormalizedComment | null {
  const createdAt = new Date(raw.createdTime ?? '')
  if (Number.isNaN(createdAt.getTime())) return null

  return {
    externalId: raw.id,
    postExternalId,
    authorName: raw.from?.name ?? '',
    authorHandle: raw.from?.username,
    authorPlatformId: raw.from?.id,
    isOwner: raw.from?.isOwner,
    text: raw.message ?? '',
    createdAt,
  }
}

/**
 * NOT verified against a live payload, unlike toNormalizedComment above.
 * Google Business reviews were not reachable to capture a real response on
 * 2026-11-07, so these field names remain the original assumption and may be
 * wrong in the same way the comment ones were. The null return guards the
 * same failure mode in the meantime.
 */
export function toNormalizedReview(raw: RawZernioReview): NormalizedReview | null {
  const createdAt = new Date(raw.createTime ?? '')
  if (Number.isNaN(createdAt.getTime())) return null

  return {
    externalId: raw.reviewId,
    rating: typeof raw.starRating === 'number' ? raw.starRating : null,
    text: raw.comment ?? null,
    authorName: raw.reviewer?.displayName ?? null,
    createdAt,
  }
}
