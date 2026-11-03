import { describe, it, expect, vi } from 'vitest'
import {
  buildAuthorFilter,
  buildThreadFilter,
  checkAiReplyCap,
  aiReplyCapEscalationReason,
  UNIDENTIFIED_AUTHOR_NAME,
  type ThreadComment,
} from './comment-thread'

function makeComment(overrides: Partial<ThreadComment> = {}): ThreadComment {
  return {
    socialAccountId: 'acc-1',
    platformPostId:  'plat-post-1',
    authorName:      'Jane Doe',
    authorHandle:    '@janedoe',
    ...overrides,
  }
}

/** Minimal stub of the only prisma.comment method this module uses. */
function makeDb(count: number) {
  return { count: vi.fn().mockResolvedValue(count) }
}

describe('buildAuthorFilter', () => {
  it('prefers authorHandle, the stable per-platform identifier, over the display name', () => {
    expect(buildAuthorFilter(makeComment())).toEqual({ authorHandle: '@janedoe' })
  })

  it('falls back to authorName when no handle is available', () => {
    expect(buildAuthorFilter(makeComment({ authorHandle: null }))).toEqual({ authorName: 'Jane Doe' })
  })

  it('trims surrounding whitespace rather than treating it as part of the identity', () => {
    expect(buildAuthorFilter(makeComment({ authorHandle: '  @janedoe  ' }))).toEqual({ authorHandle: '@janedoe' })
  })

  it('treats a whitespace-only handle as absent and falls through to the name', () => {
    expect(buildAuthorFilter(makeComment({ authorHandle: '   ' }))).toEqual({ authorName: 'Jane Doe' })
  })

  // This is the case that would otherwise pool every anonymous commenter on
  // the platform into one shared reply budget: ingestion writes the literal
  // string 'Unknown' whenever a platform gives us no author at all (see
  // services/comments/sync.ts), so grouping on it would mean one stranger
  // exhausting the cap silently gags the AI for all the others.
  it('refuses to identify the "Unknown" ingestion placeholder, so unrelated anonymous commenters never share a budget', () => {
    expect(buildAuthorFilter(makeComment({ authorHandle: null, authorName: UNIDENTIFIED_AUTHOR_NAME }))).toBeNull()
  })

  it('returns null when neither a handle nor a name is present', () => {
    expect(buildAuthorFilter(makeComment({ authorHandle: null, authorName: '' }))).toBeNull()
  })
})

describe('buildThreadFilter', () => {
  it('scopes a thread to the account, the post, and the participant', () => {
    expect(buildThreadFilter(makeComment())).toEqual({
      socialAccountId: 'acc-1',
      platformPostId:  'plat-post-1',
      authorHandle:    '@janedoe',
    })
  })

  // Matching platformPostId: null would make every post-less comment its own
  // isolated thread and hand each one a fresh budget -- a hole straight
  // through the guardrail. Dropping the constraint instead counts slightly
  // too broadly, which only ever escalates to a human sooner.
  it('widens to the whole account rather than matching a null post id', () => {
    expect(buildThreadFilter(makeComment({ platformPostId: null }))).toEqual({
      socialAccountId: 'acc-1',
      authorHandle:    '@janedoe',
    })
  })

  it('returns null when the author cannot be identified', () => {
    expect(buildThreadFilter(makeComment({ authorHandle: null, authorName: UNIDENTIFIED_AUTHOR_NAME }))).toBeNull()
  })
})

describe('checkAiReplyCap', () => {
  it('reports the cap reached once prior AI replies equal the limit', async () => {
    const db = makeDb(3)

    const result = await checkAiReplyCap(db, makeComment(), 3)

    expect(result).toEqual({ reached: true, repliesSoFar: 3, limit: 3 })
  })

  it('allows a reply while the thread is still under the limit', async () => {
    const db = makeDb(2)

    const result = await checkAiReplyCap(db, makeComment(), 3)

    expect(result).toEqual({ reached: false, repliesSoFar: 2, limit: 3 })
  })

  // Defensive rather than expected: the count should never exceed the limit,
  // but if a limit is lowered after a thread has already run past it, the
  // thread must read as capped instead of wrapping back around to allowed.
  it('stays capped when prior replies already exceed a newly lowered limit', async () => {
    const db = makeDb(9)

    const result = await checkAiReplyCap(db, makeComment(), 3)

    expect(result.reached).toBe(true)
  })

  it('counts only autonomous replies, so a human reply never consumes the budget', async () => {
    const db = makeDb(1)

    await checkAiReplyCap(db, makeComment(), 3)

    expect(db.count).toHaveBeenCalledWith({
      where: {
        socialAccountId: 'acc-1',
        platformPostId:  'plat-post-1',
        authorHandle:    '@janedoe',
        aiResponded:     true,
      },
    })
  })

  it('treats 0 as unlimited and does not query the database at all', async () => {
    const db = makeDb(99)

    const result = await checkAiReplyCap(db, makeComment(), 0)

    expect(result.reached).toBe(false)
    expect(db.count).not.toHaveBeenCalled()
  })

  it('treats a negative limit as unlimited rather than capping everything', async () => {
    const db = makeDb(99)

    const result = await checkAiReplyCap(db, makeComment(), -1)

    expect(result.reached).toBe(false)
    expect(db.count).not.toHaveBeenCalled()
  })

  it('does not query, and does not cap, when the author cannot be identified', async () => {
    const db = makeDb(99)

    const result = await checkAiReplyCap(
      db,
      makeComment({ authorHandle: null, authorName: UNIDENTIFIED_AUTHOR_NAME }),
      3
    )

    expect(result).toEqual({ reached: false, repliesSoFar: 0, limit: 3 })
    expect(db.count).not.toHaveBeenCalled()
  })
})

describe('aiReplyCapEscalationReason', () => {
  it('states the situation and the handover, not a failure', () => {
    const reason = aiReplyCapEscalationReason({ reached: true, repliesSoFar: 3, limit: 3 })

    expect(reason).toBe('AI reply limit reached for this conversation (3 of 3). Handed over for a human reply.')
  })
})
