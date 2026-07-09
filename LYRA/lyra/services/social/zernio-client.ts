// Thin REST wrapper around Zernio's HTTP API. This is the ONLY file in the codebase that
// knows Zernio's HTTP shape (paths, field names, response envelopes). No business logic,
// no field renaming beyond what's needed to call the right endpoint, no cross-call
// orchestration — that belongs to the mapper/provider layers built on top of this client.

const BASE = 'https://zernio.com/api/v1'

// Carries Zernio's actual HTTP status so callers can distinguish actionable
// client errors (e.g. 402 payment required, 429 rate limited) from real
// internal failures instead of collapsing everything into a generic 500.
export class ZernioApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ZernioApiError'
    this.status = status
  }
}

function key(): string {
  const k = process.env.ZERNIO_API_KEY
  if (!k) throw new Error('ZERNIO_API_KEY is not set')
  return k
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 429) throw new ZernioApiError(429, 'Zernio rate limited (429)')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { message?: string }).message ?? `Zernio ${method} ${path} failed (${res.status})`
    throw new ZernioApiError(res.status, msg)
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

  publishNow: (accountId: string, platform: string, content: string, mediaUrls?: string[]) =>
    req<{
      post: {
        id: string
        content: string
        status: string
        platforms: Array<{
          platform: string
          status: string
          accountId: string
          platformPostId?: string
          publishedUrl?: string
          error?: string
        }>
      }
    }>('POST', '/posts', {
      content,
      platforms: [{ platform, accountId, ...(mediaUrls ? { mediaUrls } : {}) }],
      publishNow: true,
    }),

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
  // Response account objects carry a required `profileId` field (confirmed via the
  // AccountsListResponse schema). The unique-id field name on this specific list endpoint
  // was not confirmed by a live call (test account had zero connected accounts at build
  // time) -- webhook payloads and a related "account health" endpoint both use `accountId`,
  // while `createProfile`'s single-resource response uses `_id`, so both are accepted
  // defensively here until a real connected account confirms which one this endpoint uses.
  listAccounts: () =>
    req<{ accounts: Array<{ _id?: string; accountId?: string; profileId: string; platform: string; [key: string]: unknown }> }>(
      'GET',
      '/accounts'
    ),

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
