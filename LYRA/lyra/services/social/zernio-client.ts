// Thin REST wrapper around Zernio's HTTP API. This is the ONLY file in the codebase that
// knows Zernio's HTTP shape (paths, field names, response envelopes). No business logic,
// no field renaming beyond what's needed to call the right endpoint, no cross-call
// orchestration — that belongs to the mapper/provider layers built on top of this client.

import { createHash } from 'crypto'

const BASE = 'https://zernio.com/api/v1'

// Carries Zernio's actual HTTP status so callers can distinguish actionable
// client errors (e.g. 402 payment required, 429 rate limited) from real
// internal failures instead of collapsing everything into a generic 500.
// `body` carries the parsed error response so callers needing more than the
// message -- e.g. publishNow's 409 content-hash-dedup handling, which needs
// `existingPostId` -- don't have to re-fetch or re-parse anything.
export class ZernioApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'ZernioApiError'
    this.status = status
    this.body = body
  }
}

function key(): string {
  const k = process.env.ZERNIO_API_KEY
  if (!k) throw new Error('ZERNIO_API_KEY is not set')
  return k
}

// Deterministic per input -- same postId always produces the same request id,
// so every BullMQ retry of the same logical publish reuses it (required for
// Zernio's x-request-id idempotency layer to actually recognize retries as
// the same logical request instead of a fresh one). UUID-shaped defensively
// (Zernio's docs example is a UUID) even though this isn't a real random UUID.
function stableRequestId(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

// Our own upload flow only ever produces these extensions (see ALLOWED_MIME_TYPES in
// app/api/upload/presign/route.ts) -- video vs image is all Zernio's mediaItems needs.
function mediaItemType(url: string): 'image' | 'video' {
  return /\.(mp4|mov|webm)$/i.test(url) ? 'video' : 'image'
}

async function req<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 429) throw new ZernioApiError(429, 'Zernio rate limited (429)')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Zernio's error responses use `error`, not `message` -- confirmed via their
    // idempotency docs' 409 example (`{"error": "Duplicate post detected...",
    // "existingPostId": "..."}`). Checking message first is harmless (some
    // endpoints may use it) but error was previously never read at all, so every
    // 409/422/etc. fell back to a generic message with no actual detail.
    const errBody = data as { message?: string; error?: string }
    const msg = errBody.message ?? errBody.error ?? `Zernio ${method} ${path} failed (${res.status})`
    throw new ZernioApiError(res.status, msg, data)
  }
  return data as T
}

export const zernioClient = {
  createProfile: (name: string, description?: string) =>
    req<{ profile: { _id: string; [key: string]: unknown } }>('POST', '/profiles', {
      name,
      ...(description ? { description } : {}),
    }),

  getConnectUrl: (platform: string, profileId: string, redirectUrl: string) =>
    req<{ authUrl: string }>(
      'GET',
      `/connect/${encodeURIComponent(platform)}?profileId=${encodeURIComponent(profileId)}&redirect_url=${encodeURIComponent(redirectUrl)}`
    ),

  // idempotencyKey should be the LYRA Post.id -- stable across every BullMQ retry of
  // the same logical publish. Sent as Zernio's x-request-id header (their "Layer 1"
  // idempotency): confirmed live 2026-07-21 that without this, a client-side timeout
  // on the first attempt (Instagram/LinkedIn video publishing routinely exceeds our
  // 20s timeout even though it succeeds server-side) caused BullMQ's retry to call
  // this endpoint a second time with identical content, which Zernio's independent
  // "Layer 2" content-hash dedup correctly rejected with 409 -- but that 409 then
  // surfaced as a FAILED post in LYRA for content that had genuinely already
  // published. With a stable x-request-id, a retry within Zernio's ~5 minute window
  // gets back 200 + the original post (`existingPost`) instead.
  publishNow: (accountId: string, platform: string, content: string, mediaUrls?: string[], idempotencyKey?: string) =>
    req<{
      post?: {
        id: string
        content: string
        status: string
        platforms: Array<{
          platform: string
          status: string
          accountId: string
          platformPostId?: string
          platformPostUrl?: string
          error?: string
        }>
      }
      existingPost?: {
        id: string
        content: string
        status: string
        platforms: Array<{
          platform: string
          status: string
          accountId: string
          platformPostId?: string
          platformPostUrl?: string
          error?: string
        }>
      }
    }>(
      'POST',
      '/posts',
      {
        content,
        platforms: [{ platform, accountId }],
        // mediaItems is top-level on the post, not nested per-platform -- confirmed via
        // Zernio docs ("POST /v1/posts" request body). A per-platform `mediaUrls` field
        // isn't part of their schema at all, so it was previously being silently ignored:
        // posts published with text only, media dropped, no error either side.
        ...(mediaUrls?.length ? { mediaItems: mediaUrls.map((url) => ({ type: mediaItemType(url), url })) } : {}),
        publishNow: true,
      },
      idempotencyKey ? { 'x-request-id': stableRequestId(idempotencyKey) } : undefined
    ),

  // There is no single endpoint that returns a flat list of comments for one account.
  // The real API is two-step: list POSTS that have comments (across all connected
  // accounts), then fetch the comments for one specific post (accountId required).
  listCommentedPosts: (platform?: string) =>
    req<{ posts: unknown[] }>('GET', `/inbox/comments${platform ? `?platform=${encodeURIComponent(platform)}` : ''}`),

  getPostComments: (postId: string, accountId: string) =>
    req<{ comments: unknown[] }>(
      'GET',
      `/inbox/comments/${encodeURIComponent(postId)}?accountId=${encodeURIComponent(accountId)}`
    ),

  // Pass commentId to target one specific existing comment; omitting it posts a fresh
  // top-level comment on the post instead. Confirmed camelCase wire field via Zernio docs
  // (POST /v1/inbox/comments/{postId} request body: accountId, message, commentId, ...).
  replyToComment: (postId: string, accountId: string, text: string, commentId?: string) =>
    req<{ [key: string]: unknown }>('POST', `/inbox/comments/${encodeURIComponent(postId)}`, {
      accountId,
      message: text,
      ...(commentId ? { commentId } : {}),
    }),

  // GET /v1/accounts has no server-side profileId filter -- confirmed via Zernio docs,
  // it only supports optional page/limit pagination, and omitting both returns the full
  // list (bounded by the account's plan limit, backward-compatible). So callers that need
  // to verify which profile an account belongs to must filter this list client-side.
  // Confirmed live 2026-07-09 against a real connected account: the unique-id field is
  // `_id` (no `accountId` on this endpoint's account objects, unlike webhook payloads --
  // kept as a fallback below in case that varies by account type). `profileId` comes back
  // as a POPULATED OBJECT (`{ _id, name }`), not a bare string -- callers must compare
  // `.profileId._id` (or `.profileId` directly if a future response shape flattens it).
  listAccounts: () =>
    req<{
      accounts: Array<{
        _id?: string
        accountId?: string
        profileId: string | { _id: string; [key: string]: unknown }
        platform: string
        [key: string]: unknown
      }>
    }>(
      'GET',
      '/accounts'
    ),

  // Single-post lookups can come back 202 (sync still pending on the platform's
  // side) or 424 (the platform-side sync failed) -- both are legitimate outcomes,
  // not just error cases, so callers should check `syncStatus` rather than only
  // relying on this not throwing. Accepts either a Zernio post id or the native
  // platform post id (auto-resolved) -- confirmed live 17 Jul 2026, both work.
  getPostAnalytics: (postId: string) =>
    req<{
      syncStatus: string
      analytics?: {
        impressions?: number
        reach?: number
        likes?: number
        comments?: number
        shares?: number
        saves?: number
        clicks?: number
      }
    }>('GET', `/analytics?postId=${encodeURIComponent(postId)}`),

  getGoogleBusinessReviews: (accountId: string) =>
    req<{
      success: boolean
      accountId: string
      locationId: string
      reviews: unknown[]
      averageRating: number
      totalReviewCount: number
      nextPageToken?: string
    }>('GET', `/accounts/${encodeURIComponent(accountId)}/gmb-reviews`),

  replyToGoogleBusinessReview: (accountId: string, reviewExternalId: string, text: string) =>
    req<{ [key: string]: unknown }>(
      'POST',
      `/accounts/${encodeURIComponent(accountId)}/gmb-reviews/${encodeURIComponent(reviewExternalId)}/reply`,
      { comment: text }
    ),
}

export type ZernioClient = typeof zernioClient
