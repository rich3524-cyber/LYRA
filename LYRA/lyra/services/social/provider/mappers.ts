import type { NormalizedComment, NormalizedReview } from './types'

interface RawZernioComment {
  id: string
  postId: string
  author?: { name?: string; username?: string }
  text?: string
  createdAt: string
}

interface RawZernioReview {
  reviewId: string
  starRating?: number
  comment?: string
  reviewer?: { displayName?: string }
  createTime: string
}

export function toNormalizedComment(raw: RawZernioComment): NormalizedComment {
  return {
    externalId: raw.id,
    postExternalId: raw.postId,
    authorName: raw.author?.name ?? '',
    authorHandle: raw.author?.username,
    text: raw.text ?? '',
    createdAt: new Date(raw.createdAt),
  }
}

export function toNormalizedReview(raw: RawZernioReview): NormalizedReview {
  return {
    externalId: raw.reviewId,
    rating: typeof raw.starRating === 'number' ? raw.starRating : null,
    text: raw.comment ?? null,
    authorName: raw.reviewer?.displayName ?? null,
    createdAt: new Date(raw.createTime),
  }
}
