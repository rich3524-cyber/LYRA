import type { SocialAccount } from '@prisma/client'
import { zernioClient } from '../zernio-client'
import { toNormalizedComment, toNormalizedReview } from './mappers'
import { platformEnumToZernioSlug } from './platform-map'
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
      platformEnumToZernioSlug(account.platform),
      input.content,
      input.mediaUrls
    )
    // Safe because publishNow always sends exactly one platform entry, so platforms[0]
    // is the intended target even on an accountId-echo mismatch. Would need revisiting
    // if a future change starts publishing multiple platforms in one call.
    const target =
      res.post.platforms.find((p) => p.accountId === zernioAccountId) ?? res.post.platforms[0]
    if (!target) {
      throw new Error(`Zernio publish returned no platform result for account ${zernioAccountId}`)
    }
    // Only an explicit error/failed status means the publish actually failed.
    // Confirmed live 17 Jul 2026: a genuinely successful Instagram publish was
    // wrongly marked FAILED here because this used to hard-fail whenever
    // `platformPostId` specifically was absent, regardless of the platform's own
    // reported status -- but Zernio's docs confirm the synchronous publishNow
    // response's identifier field is named `platformPostUrl`, not
    // `platformPostId`, so that field being present was never a reliable
    // failure signal on its own. Accept whichever identifier is actually there.
    if (target.status === 'failed' || target.error) {
      throw new Error(target.error ?? `Zernio publish failed for account ${zernioAccountId} (status: ${target.status})`)
    }
    const platformPostId = target.platformPostId ?? target.platformPostUrl
    if (!platformPostId) {
      throw new Error(
        `Zernio publish returned status "${target.status}" with no post identifier for account ${zernioAccountId}`
      )
    }
    return { platformPostId, zernioPostId: res.post.id }
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
