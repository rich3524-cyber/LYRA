import type { SocialAccount } from '@prisma/client'

export interface NormalizedComment {
  externalId: string      // provider's comment id (stored in Comment.platformCommentId)
  postExternalId: string  // parent post id on the platform
  authorName: string
  authorHandle?: string
  text: string
  createdAt: Date
}

export interface NormalizedReview {
  externalId: string      // provider's review id (stored in Review.zernioReviewId)
  rating: number | null
  text: string | null
  authorName: string | null
  createdAt: Date
}

export interface PublishInput {
  content: string
  mediaUrls?: string[]
}

export interface SocialProvider {
  publish(account: SocialAccount, input: PublishInput): Promise<{ platformPostId: string }>
  fetchRecentComments(account: SocialAccount): Promise<NormalizedComment[]>
  // postExternalId is required because Zernio's reply endpoint is scoped to a post
  // (POST /inbox/comments/{postId}), not the comment alone. Callers already have this —
  // it's NormalizedComment.postExternalId from ingestion.
  replyToComment(account: SocialAccount, postExternalId: string, externalId: string, text: string): Promise<void>
  fetchReviews(account: SocialAccount): Promise<NormalizedReview[]>
  replyToReview(account: SocialAccount, externalId: string, text: string): Promise<void>
}

export class ProviderUnsupported extends Error {
  constructor(operation: string, platform: string) {
    super(`Provider does not support ${operation} for ${platform}`)
    this.name = 'ProviderUnsupported'
  }
}
