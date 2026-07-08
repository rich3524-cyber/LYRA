import { describe, it, expect } from 'vitest'
import { toNormalizedComment, toNormalizedReview } from './mappers'

describe('toNormalizedComment', () => {
  it('maps a Zernio inbox comment to the normalized shape', () => {
    const raw = {
      id: 'c_123',
      platformPostId: 'p_456',
      author: { name: 'Jane Doe', username: 'janed' },
      text: 'Love this!',
      createdAt: '2026-07-08T10:00:00.000Z',
    }
    expect(toNormalizedComment(raw)).toEqual({
      externalId: 'c_123',
      postExternalId: 'p_456',
      authorName: 'Jane Doe',
      authorHandle: 'janed',
      text: 'Love this!',
      createdAt: new Date('2026-07-08T10:00:00.000Z'),
    })
  })

  it('falls back to empty author handle and blank name when missing', () => {
    const raw = { id: 'c_1', platformPostId: 'p_1', text: 'hi', createdAt: '2026-07-08T10:00:00.000Z' }
    const out = toNormalizedComment(raw)
    expect(out.authorHandle).toBeUndefined()
    expect(out.authorName).toBe('')
  })
})

describe('toNormalizedReview', () => {
  it('maps a Zernio GBP review to the normalized shape', () => {
    const raw = {
      reviewId: 'r_789',
      starRating: 4,
      comment: 'Good service',
      reviewer: { displayName: 'Bob' },
      createTime: '2026-07-08T09:00:00.000Z',
    }
    expect(toNormalizedReview(raw)).toEqual({
      externalId: 'r_789',
      rating: 4,
      text: 'Good service',
      authorName: 'Bob',
      createdAt: new Date('2026-07-08T09:00:00.000Z'),
    })
  })

  it('maps a rating-less review (open-ended) to rating null', () => {
    const raw = { reviewId: 'r_1', comment: 'text only', reviewer: {}, createTime: '2026-07-08T09:00:00.000Z' }
    const out = toNormalizedReview(raw)
    expect(out.rating).toBeNull()
    expect(out.authorName).toBeNull()
  })
})
