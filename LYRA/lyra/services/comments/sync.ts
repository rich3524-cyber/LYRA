// services/comments/sync.ts
//
// Per-account comment-sync orchestration for POST /api/comments/sync --
// resolves the right fetch path per platform (the Zernio-routed provider
// abstraction, or a direct Graph/LinkedIn call for accounts connected before
// Zernio), normalizes results, filters out the account's own comments on its
// own posts, and persists new rows. Split out of the route so this
// platform-dispatch logic is testable without an HTTP request, following the
// services/posts/bulk-import.ts pattern (DB calls stay in this one file).
import type { SocialAccount } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import * as linkedin from '@/services/social/linkedin'
import { getProvider } from '@/services/social/provider'
import type { NormalizedComment, NormalizedReview } from '@/services/social/provider/types'

export interface RawComment {
  id: string
  message: string
  from?: { name?: string }
  created_time: string
}

/**
 * Mirrors the webhook's self-comment filter: drops comments posted by the
 * connected account itself (e.g. a Facebook Page commenting on its own
 * post). Only the account's own name/handle is available here to compare
 * against -- the webhook additionally has an isOwner flag.
 */
export function filterSelfComments(
  comments: NormalizedComment[],
  account: { name: string | null; handle: string | null }
): NormalizedComment[] {
  const selfName = account.name?.toLowerCase()
  const selfHandle = account.handle?.toLowerCase()
  return comments.filter((c) => {
    if (selfName && c.authorName?.toLowerCase() === selfName) return false
    if (selfHandle && c.authorHandle?.toLowerCase() === selfHandle) return false
    return true
  })
}

/**
 * Direct Graph/LinkedIn fetch path for accounts not routed through Zernio.
 * Returns [] (never throws for "nothing found") -- a thrown error means the
 * fetch itself failed and is handled by the caller.
 */
async function fetchRawComments(account: SocialAccount, token: string): Promise<RawComment[]> {
  let rawComments: RawComment[] = []

  if (account.platform === 'FACEBOOK') {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${account.platformId}/feed?fields=comments{message,from,created_time}&limit=25&access_token=${token}`
    )
    const data = await res.json() as { data?: Array<{ comments?: { data?: RawComment[] } }> }
    for (const post of data.data ?? []) {
      rawComments = rawComments.concat(post.comments?.data ?? [])
    }
  } else if (account.platform === 'INSTAGRAM') {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${account.platformId}/media?fields=comments{text,username,timestamp}&limit=25&access_token=${token}`
    )
    const data = await res.json() as {
      data?: Array<{ comments?: { data?: Array<{ id: string; text: string; username?: string; timestamp: string }> } }>
    }
    for (const media of data.data ?? []) {
      for (const c of media.comments?.data ?? []) {
        rawComments.push({ id: c.id, message: c.text, from: { name: c.username }, created_time: c.timestamp })
      }
    }
  } else if (account.platform === 'LINKEDIN') {
    // Fetch recent org posts then gather comments on each.
    // platformCommentId for LinkedIn = full comment URN (encodes post context for replies).
    const posts = await linkedin.getOrgPosts(token, account.platformId)
    for (const post of posts.slice(0, 10)) {
      const comments = await linkedin.getPostComments(token, post.urn)
      for (const c of comments) {
        rawComments.push({
          id:           c.commentUrn,
          message:      c.text,
          from:         { name: 'LinkedIn Member' },
          created_time: new Date(c.createdAt).toISOString(),
        })
      }
    }
  }

  return rawComments
}

/**
 * Syncs one connected account's recent comments into the DB and returns how
 * many new rows were created. Per-account failures are swallowed (logged,
 * not thrown) so one bad account can't block sync for the rest of the
 * workspace -- matching the original inline loop's resilience.
 */
export async function syncAccountComments(account: SocialAccount, workspaceId: string): Promise<number> {
  // Zernio-connected accounts (the default connection method going forward)
  // never have a local accessToken -- Zernio holds the platform credentials
  // on their own side. Routed through the same provider abstraction
  // publish()/replyToComment() already use.
  if (account.provider === 'ZERNIO' && account.zernioAccountId != null) {
    let normalized: NormalizedComment[]
    try {
      normalized = await getProvider(account).fetchRecentComments(account)
    } catch (err) {
      console.error(`Zernio comment sync failed for account ${account.id}:`, err)
      return 0
    }
    if (normalized.length === 0) return 0

    const incoming = filterSelfComments(normalized, account)
    if (incoming.length === 0) return 0

    // Wrapped in its own try/catch, same as the fetch above -- otherwise a
    // persistence failure here would throw uncaught out of this function.
    // syncWorkspaceComments' loop below has no try/catch around its call to
    // this function, so an uncaught throw wouldn't just fail this one
    // account (as the docstring above promises) -- it would abort the entire
    // workspace sync, skipping every remaining account. Logging + returning 0
    // instead keeps persistence failures behaving exactly like fetch failures
    // already do: isolated to this one account.
    try {
      const created = await prisma.comment.createManyAndReturn({
        data: incoming.map((c) => ({
          workspaceId,
          socialAccountId:   account.id,
          platformCommentId: c.externalId,
          platformPostId:    c.postExternalId,
          authorName:        c.authorName || 'Unknown',
          authorHandle:      c.authorHandle,
          content:           c.text,
          platformCreatedAt: c.createdAt,
          status:            'PENDING' as const,
        })),
        skipDuplicates: true,
      })
      return created.length
    } catch (err) {
      console.error(`Failed to persist comments for account ${account.id}:`, err)
      return 0
    }
  }

  if (!account.accessToken) {
    console.error(`Skipping comment sync for account ${account.id} — no access token`)
    return 0
  }
  const token = decrypt(account.accessToken)

  let rawComments: RawComment[]
  try {
    rawComments = await fetchRawComments(account, token)
  } catch (err) {
    // Per-account resilience is intentional here (one account's failure
    // shouldn't block sync for the others, matching the Zernio branch
    // above).
    console.error(`Comment sync failed for account ${account.id}:`, err)
    return 0
  }

  if (rawComments.length === 0) return 0

  // Wrapped in its own try/catch, same as the fetch above and the Zernio
  // branch's persistence call -- otherwise a persistence failure here would
  // throw uncaught out of this function and (per syncWorkspaceComments' loop
  // having no try/catch around its call to this function) abort the entire
  // workspace sync instead of being isolated to this one account.
  try {
    const created = await prisma.comment.createManyAndReturn({
      data: rawComments.map((comment) => ({
        workspaceId,
        socialAccountId:   account.id,
        platformCommentId: comment.id,
        authorName:        comment.from?.name ?? 'Unknown',
        content:           comment.message,
        platformCreatedAt: new Date(comment.created_time),
        status:            'PENDING' as const,
      })),
      skipDuplicates: true,
    })
    return created.length
  } catch (err) {
    console.error(`Failed to persist comments for account ${account.id}:`, err)
    return 0
  }
}

/**
 * Syncs one connected Google Business account's reviews into the DB and
 * returns how many new rows were created. Reviews have no native
 * (non-Zernio) fetch path, unlike comments -- Google Business review sync
 * only exists through Zernio's fetchReviews, so any account that isn't a
 * GOOGLE_BUSINESS account on the Zernio path is a cheap no-op. Per-account
 * failures are swallowed (logged, not thrown), matching syncAccountComments'
 * resilience above so one bad account can't block sync for the rest of the
 * workspace.
 */
export async function syncAccountReviews(account: SocialAccount, workspaceId: string): Promise<number> {
  if (account.platform !== 'GOOGLE_BUSINESS' || account.provider !== 'ZERNIO' || account.zernioAccountId == null) {
    return 0
  }

  let normalized: NormalizedReview[]
  try {
    normalized = await getProvider(account).fetchReviews(account)
  } catch (err) {
    console.error(`Zernio review sync failed for account ${account.id}:`, err)
    return 0
  }
  if (normalized.length === 0) return 0

  // Wrapped in its own try/catch, same as the fetch above -- otherwise a
  // persistence failure here would throw uncaught out of this function.
  // syncWorkspaceComments' loop below has no try/catch around its call to
  // this function, so an uncaught throw wouldn't just fail this one
  // account (as the docstring above promises) -- it would abort the entire
  // workspace sync, skipping every remaining account. Logging + returning 0
  // instead keeps persistence failures behaving exactly like fetch failures
  // already do: isolated to this one account.
  try {
    const created = await prisma.review.createManyAndReturn({
      data: normalized.map((r) => ({
        workspaceId,
        socialAccountId:   account.id,
        zernioReviewId:    r.externalId,
        rating:            r.rating,
        authorName:        r.authorName,
        text:              r.text,
        platformCreatedAt: r.createdAt,
        status:            'PENDING' as const,
      })),
      skipDuplicates: true,
    })
    return created.length
  } catch (err) {
    console.error(`Failed to persist reviews for account ${account.id}:`, err)
    return 0
  }
}

/**
 * Loads every active FACEBOOK/INSTAGRAM/LINKEDIN/GOOGLE_BUSINESS account in
 * the workspace and syncs each in turn, returning the total number of newly
 * created comment + review rows.
 */
export async function syncWorkspaceComments(workspaceId: string): Promise<number> {
  // Fetches the full row (not a narrow select) because getProvider(account).
  // fetchRecentComments(account) needs the whole SocialAccount shape, same as
  // every other provider-dispatched call site in the codebase (e.g.
  // post-publisher.worker.ts's include: { socialAccount: true }).
  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId, isActive: true, platform: { in: ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'GOOGLE_BUSINESS'] } },
  })

  let newCount = 0
  for (const account of accounts) {
    newCount += await syncAccountComments(account, workspaceId)
    newCount += await syncAccountReviews(account, workspaceId)
  }
  return newCount
}
