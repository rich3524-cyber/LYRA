import { describe, it, expect } from 'vitest'
import { toNormalizedComment, toNormalizedReview } from './mappers'

describe('toNormalizedComment', () => {
  // Field-for-field from a live Zernio getPostComments response captured on
  // 2026-11-07 (Instagram, into.thewildmarketing). The previous version of
  // this test fed the mapper the shape the mapper expected, so it passed
  // while production failed on every single comment -- the assumption and
  // its test agreed with each other and with nothing else.
  const LIVE_PAYLOAD = {
    id: '18616652872019861',
    message: 'Great info',
    createdTime: '2026-08-24T23:05:20+0000',
    from: { id: '27820553427572105', name: 'rich.unwin.9', username: 'rich.unwin.9', isOwner: false },
    likeCount: 0,
    replyCount: 1,
    platform: 'instagram',
  }

  it('maps a real Zernio comment payload', () => {
    expect(toNormalizedComment(LIVE_PAYLOAD, '18106518875609763')).toEqual({
      externalId: '18616652872019861',
      postExternalId: '18106518875609763',
      authorName: 'rich.unwin.9',
      authorHandle: 'rich.unwin.9',
      // Carried through for self-comment detection -- the polling path had
      // neither of these before, which is why its self-check was weaker than
      // the webhook's. See lib/self-comment.ts.
      authorPlatformId: '27820553427572105',
      isOwner: false,
      text: 'Great info',
      createdAt: new Date('2026-08-24T23:05:20.000Z'),
    })
  })

  // Zernio's "+0000" offset has no colon, which is not strict ISO 8601.
  // Asserting it explicitly because the whole failure was a date that did
  // not survive the trip.
  it('parses the +0000 offset Zernio sends', () => {
    const out = toNormalizedComment(LIVE_PAYLOAD, 'p_1')
    expect(out?.createdAt.toISOString()).toBe('2026-08-24T23:05:20.000Z')
  })

  // The post id is a parameter because the comment payload has no post
  // reference at all. Reading a non-existent platformPostId field is what
  // previously left every comment unroutable.
  it('takes the post id from the caller, not the payload', () => {
    const withDecoy = { ...LIVE_PAYLOAD, platformPostId: 'WRONG' }
    expect(toNormalizedComment(withDecoy, 'correct-post')?.postExternalId).toBe('correct-post')
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['unparseable', 'not a date'],
  ])('returns null for a %s timestamp rather than an Invalid Date', (_label, createdTime) => {
    expect(toNormalizedComment({ ...LIVE_PAYLOAD, createdTime }, 'p_1')).toBeNull()
  })

  it('tolerates a missing author and message without dropping the comment', () => {
    const out = toNormalizedComment({ id: 'c_1', createdTime: '2026-07-08T10:00:00.000Z' }, 'p_1')
    expect(out).toMatchObject({ authorName: '', authorHandle: undefined, text: '' })
  })
})

describe('toNormalizedReview', () => {
  // NOTE: unlike the comment payload above, this shape has NOT been verified
  // against a live Zernio response -- Google Business reviews were not
  // reachable on 2026-11-07. It may be wrong in exactly the way the comment
  // mapper was. These tests pin current behaviour, not confirmed reality.
  it('maps a Zernio GBP review to the normalized shape', () => {
    expect(toNormalizedReview({
      reviewId: 'r_789',
      starRating: 4,
      comment: 'Good service',
      reviewer: { displayName: 'Bob' },
      createTime: '2026-07-08T09:00:00.000Z',
    })).toEqual({
      externalId: 'r_789',
      rating: 4,
      text: 'Good service',
      authorName: 'Bob',
      createdAt: new Date('2026-07-08T09:00:00.000Z'),
    })
  })

  it('maps a rating-less review (open-ended) to rating null', () => {
    const out = toNormalizedReview({ reviewId: 'r_1', comment: 'text only', reviewer: {}, createTime: '2026-07-08T09:00:00.000Z' })
    expect(out?.rating).toBeNull()
    expect(out?.authorName).toBeNull()
  })

  it('returns null for an unparseable createTime rather than failing the batch', () => {
    expect(toNormalizedReview({ reviewId: 'r_1', createTime: 'not a date' })).toBeNull()
  })
})
