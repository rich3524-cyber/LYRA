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

// Abbreviated form for tight spaces (calendar chips, comment cards). Exhaustive
// for the same reason as PLATFORM_LABELS above -- this was re-forked as a
// local, incomplete `Record<string, string>` in several components after the
// 2026-08-02 dedup, some missing up to 4 of the 10 platforms and rendering
// the raw enum value to customers (e.g. "YOUTUBE" in the inbox).
export const PLATFORM_SHORT_LABELS: Record<Platform, string> = {
  FACEBOOK: 'FB',
  INSTAGRAM: 'IG',
  LINKEDIN: 'LI',
  GOOGLE_BUSINESS: 'GBP',
  TWITTER: 'X',
  TIKTOK: 'TT',
  YOUTUBE: 'YT',
  PINTEREST: 'PIN',
  THREADS: 'TH',
  BLUESKY: 'BSky',
}

export function getPlatformShortLabel(platform: Platform): string {
  return PLATFORM_SHORT_LABELS[platform]
}

// Platform brand colours -- inline hex is intentional here (external brand
// identities, not LYRA's own design-system tokens). Previously duplicated
// with DIVERGENT values between two components (e.g. INSTAGRAM #E1306C vs
// #C13584, TWITTER #1DA1F2 vs #888888) -- the same brand rendered in two
// different colours depending which screen you were on.
export const PLATFORM_COLORS: Record<Platform, string> = {
  FACEBOOK: '#1877F2',
  INSTAGRAM: '#C13584',
  LINKEDIN: '#0A66C2',
  GOOGLE_BUSINESS: '#4285F4',
  TWITTER: '#888888',
  TIKTOK: '#FF0050',
  YOUTUBE: '#FF0000',
  PINTEREST: '#E60023',
  THREADS: '#888888',
  BLUESKY: '#0085FF',
}

export function getPlatformColor(platform: Platform): string {
  return PLATFORM_COLORS[platform]
}
