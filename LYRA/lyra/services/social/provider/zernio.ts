import type { SocialAccount } from '@prisma/client'
import { zernioClient } from '../zernio-client'
import { toNormalizedComment, toNormalizedReview } from './mappers'
import type { NormalizedComment, PublishInput, SocialProvider } from './types'

// Best-effort assumption: Zernio's docs don't precisely specify the shape of items in
// `listCommentedPosts`'s `posts: unknown[]` array. We only need the post's id to call
// `getPostComments`. Verify this against a live Zernio account when fetchRecentComments
// is actually wired up in a later phase — this method isn't called by any route in Phase 1.
interface ZernioCommentedPost {
  id: string
}

function requireZernioId(account: SocialAccount): string {
  if (!account.zernioAccountId) {
    throw new Error(`SocialAccount ${account.id} has no zernioAccountId set`)
  }
  return account.zernioAccountId
}

export const zernioProvider: SocialProvider = {
  async publish(account, input: PublishInput) {
    const zernioAccountId = requireZernioId(account)
    const res = await zernioClient.publishNow(
      zernioAccountId,
      account.platform.toLowerCase(),
      input.content,
      input.mediaUrls
    )
    // Safe because publishNow always sends exactly one platform entry, so platforms[0]
    // is the intended target even on an accountId-echo mismatch. Would need revisiting
    // if a future change starts publishing multiple platforms in one call.
    const target =
      res.post.platforms.find((p) => p.accountId === zernioAccountId) ?? res.post.platforms[0]
    // TODO(phase-2/3): target.status can be 'pending' or 'failed' with no platformPostId —
    // this currently flattens that into an empty string rather than surfacing the failure.
    // Inspect target.status/target.error and throw (or otherwise signal) once this is wired
    // to a real publish route/worker, so a failed publish can't be mistaken for a success.
    return { platformPostId: target?.platformPostId ?? '' }
  },

  async fetchRecentComments(account) {
    const zernioAccountId = requireZernioId(account)
    const { posts } = await zernioClient.listCommentedPosts(account.platform.toLowerCase())
    const comments: NormalizedComment[] = []
    for (const post of posts as ZernioCommentedPost[]) {
      const { comments: rawComments } = await zernioClient.getPostComments(post.id, zernioAccountId)
      for (const raw of rawComments) {
        comments.push(toNormalizedComment(raw as Parameters<typeof toNormalizedComment>[0]))
      }
    }
    return comments
  },

  async replyToComment(account, postExternalId, externalId, text) {
    const zernioAccountId = requireZernioId(account)
    await zernioClient.replyToComment(postExternalId, zernioAccountId, text, externalId)
  },

  async fetchReviews(account) {
    const zernioAccountId = requireZernioId(account)
    const res = await zernioClient.getGoogleBusinessReviews(zernioAccountId)
    return res.reviews.map((raw) => toNormalizedReview(raw as Parameters<typeof toNormalizedReview>[0]))
  },

  async replyToReview(account, externalId, text) {
    const zernioAccountId = requireZernioId(account)
    await zernioClient.replyToGoogleBusinessReview(zernioAccountId, externalId, text)
  },
}
