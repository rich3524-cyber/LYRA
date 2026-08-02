import type { Platform } from '@prisma/client'

// Literal, exhaustive source of truth: every Platform enum member maps to its
// human-readable display label here. TypeScript requires every member as a
// key -- adding a new Platform value without a row here is a compile error,
// not a silent runtime `undefined` showing up in the UI.
//
// Label text was chosen by majority vote across the ~9 call sites that
// previously hand-rolled this map (see 2026-08-02 dedup). TWITTER was a
// three-way tie between "Twitter/X", "X", and "X (Twitter)" -- "X (Twitter)"
// won as the clearest to users unfamiliar with the rebrand.
export const PLATFORM_LABELS: Record<Platform, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  GOOGLE_BUSINESS: 'Google Business',
  TWITTER: 'X (Twitter)',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  PINTEREST: 'Pinterest',
  THREADS: 'Threads',
  BLUESKY: 'Bluesky',
}

export function getPlatformLabel(platform: Platform): string {
  return PLATFORM_LABELS[platform]
}
