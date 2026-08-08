import { describe, it, expect } from 'vitest'
import { getBestSlotForPlatform, nextOccurrenceOfSlot } from './best-posting-time'
import type { PostingPatterns } from '@/services/ai/engagement-analyzer'

const PATTERNS: PostingPatterns = {
  INSTAGRAM: {
    topSlots: [
      { dayOfWeek: 2, hour: 9, score: 1, sampleSize: 24 },
      { dayOfWeek: 4, hour: 18, score: 0.8, sampleSize: 12 },
    ],
    byTopic: {},
    totalPostsAnalyzed: 30,
    analyzedAt: '2026-08-01T00:00:00.000Z',
  },
  FACEBOOK: {
    topSlots: [],
    byTopic: {},
    totalPostsAnalyzed: 14,
    analyzedAt: '2026-08-01T00:00:00.000Z',
  },
}

describe('getBestSlotForPlatform', () => {
  it('returns the first (highest-scoring) top slot for a platform with data', () => {
    expect(getBestSlotForPlatform(PATTERNS, 'INSTAGRAM')).toEqual(
      { dayOfWeek: 2, hour: 9, score: 1, sampleSize: 24 }
    )
  })

  it('returns null when the platform has no top slots', () => {
    expect(getBestSlotForPlatform(PATTERNS, 'FACEBOOK')).toBeNull()
  })

  it('returns null when the platform is not present in patterns at all', () => {
    expect(getBestSlotForPlatform(PATTERNS, 'LINKEDIN')).toBeNull()
  })

  it('returns null when patterns is null', () => {
    expect(getBestSlotForPlatform(null, 'INSTAGRAM')).toBeNull()
  })

  it('returns null when no platform is selected', () => {
    expect(getBestSlotForPlatform(PATTERNS, undefined)).toBeNull()
  })
})

describe('nextOccurrenceOfSlot', () => {
  it('returns later this week when the target day/hour is still ahead of "from"', () => {
    // 2026-08-03 is a Monday (UTC). Target: Tuesday 09:00 UTC.
    const from = new Date('2026-08-03T12:00:00.000Z')
    const result = nextOccurrenceOfSlot({ dayOfWeek: 2, hour: 9, score: 1, sampleSize: 1 }, from)
    expect(result.toISOString()).toBe('2026-08-04T09:00:00.000Z')
  })

  it('jumps to next week when the target day/hour already passed this week', () => {
    // 2026-08-05 is a Wednesday (UTC). Target: Tuesday 09:00 UTC -- already passed.
    const from = new Date('2026-08-05T12:00:00.000Z')
    const result = nextOccurrenceOfSlot({ dayOfWeek: 2, hour: 9, score: 1, sampleSize: 1 }, from)
    expect(result.toISOString()).toBe('2026-08-11T09:00:00.000Z')
  })

  it('jumps to next week when it is the same day but the hour already passed', () => {
    // 2026-08-04 is a Tuesday (UTC), 12:00. Target: Tuesday 09:00 -- already passed today.
    const from = new Date('2026-08-04T12:00:00.000Z')
    const result = nextOccurrenceOfSlot({ dayOfWeek: 2, hour: 9, score: 1, sampleSize: 1 }, from)
    expect(result.toISOString()).toBe('2026-08-11T09:00:00.000Z')
  })

  it('uses later today when it is the same day and the hour has not passed yet', () => {
    // 2026-08-04 is a Tuesday (UTC), 06:00. Target: Tuesday 09:00 -- still ahead today.
    const from = new Date('2026-08-04T06:00:00.000Z')
    const result = nextOccurrenceOfSlot({ dayOfWeek: 2, hour: 9, score: 1, sampleSize: 1 }, from)
    expect(result.toISOString()).toBe('2026-08-04T09:00:00.000Z')
  })
})
