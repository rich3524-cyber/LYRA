import type { Platform } from '@prisma/client'

// Route param (as used in /api/social/connect/[platform]) -> Zernio's platform slug.
// Zernio's `googlebusiness` has no underscore (unlike our route id `google` and
// unlike Ayrshare's old `gmb`) -- confirmed against docs.zernio.com 2026-07-08.
const ROUTE_TO_ZERNIO: Record<string, string> = {
  facebook: 'facebook',
  linkedin: 'linkedin',
  google: 'googlebusiness',
  twitter: 'twitter',
  tiktok: 'tiktok',
  youtube: 'youtube',
}

// Literal, exhaustive source of truth: every Platform enum member maps to its
// Zernio slug here. TypeScript requires every member as a key -- adding a new
// Platform value without a row here is a compile error, not a silent runtime
// `undefined` flowing into a Zernio API call.
const PLATFORM_TO_ZERNIO: Record<Platform, string> = {
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  LINKEDIN: 'linkedin',
  GOOGLE_BUSINESS: 'googlebusiness',
  TWITTER: 'twitter',
  TIKTOK: 'tiktok',
  YOUTUBE: 'youtube',
  PINTEREST: 'pinterest',
  THREADS: 'threads',
  BLUESKY: 'bluesky',
}

// Derived inverse of PLATFORM_TO_ZERNIO -- not hand-duplicated, so the two
// directions can't drift out of sync.
const ZERNIO_TO_PLATFORM: Record<string, Platform> = Object.fromEntries(
  Object.entries(PLATFORM_TO_ZERNIO).map(([platform, slug]) => [slug, platform as Platform])
)

export function toZernioPlatform(routeId: string): string | null {
  return ROUTE_TO_ZERNIO[routeId] ?? null
}

export function fromZernioPlatform(zernioSlug: string): Platform | null {
  return ZERNIO_TO_PLATFORM[zernioSlug] ?? null
}

export function platformEnumToZernioSlug(platform: Platform): string {
  return PLATFORM_TO_ZERNIO[platform]
}
