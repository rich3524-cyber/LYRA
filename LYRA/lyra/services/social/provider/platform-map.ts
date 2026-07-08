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

// Zernio's platform slug (as returned in the connect-callback `connected` query
// param) -> our Prisma Platform enum. Includes platforms with no connect button
// yet (instagram, pinterest, threads, bluesky) so an unexpected callback still
// maps cleanly instead of silently failing.
const ZERNIO_TO_PLATFORM: Record<string, Platform> = {
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  linkedin: 'LINKEDIN',
  googlebusiness: 'GOOGLE_BUSINESS',
  twitter: 'TWITTER',
  tiktok: 'TIKTOK',
  youtube: 'YOUTUBE',
  pinterest: 'PINTEREST',
  threads: 'THREADS',
  bluesky: 'BLUESKY',
}

export function toZernioPlatform(routeId: string): string | null {
  return ROUTE_TO_ZERNIO[routeId] ?? null
}

export function fromZernioPlatform(zernioSlug: string): Platform | null {
  return ZERNIO_TO_PLATFORM[zernioSlug] ?? null
}
