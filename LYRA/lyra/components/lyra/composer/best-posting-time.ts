import type { PostingPatterns, PostingSlot } from '@/services/ai/engagement-analyzer'

// Exported for testability -- same reasoning as other pure functions extracted
// out of 'use client' components this session: this decides what the composer
// shows/applies, so it needs a test that invokes it directly rather than only
// ever running inline as a render-time closure.
export function getBestSlotForPlatform(
  patterns: PostingPatterns | null | undefined,
  platform: string | undefined,
): PostingSlot | null {
  if (!patterns || !platform) return null
  // topSlots is already sorted descending by score (services/ai/engagement-analyzer.ts).
  return patterns[platform]?.topSlots[0] ?? null
}

// PostingSlot's dayOfWeek/hour are UTC (analyzed from Post.publishedAt via
// getUTCDay()/getUTCHours()) -- computed here in UTC and returned as a real
// Date, which date-fns' format() then renders in the browser's local time,
// consistent with how the rest of the composer's schedule picker already
// treats Date objects.
export function nextOccurrenceOfSlot(slot: PostingSlot, from: Date): Date {
  const result = new Date(from)
  result.setUTCHours(slot.hour, 0, 0, 0)
  let daysUntil = (slot.dayOfWeek - result.getUTCDay() + 7) % 7
  if (daysUntil === 0 && result.getTime() <= from.getTime()) daysUntil = 7
  result.setUTCDate(result.getUTCDate() + daysUntil)
  return result
}
