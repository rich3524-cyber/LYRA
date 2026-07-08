import { describe, it, expect } from 'vitest'
import type { Platform } from '@prisma/client'
import { toZernioPlatform, fromZernioPlatform, platformEnumToZernioSlug } from './platform-map'

describe('toZernioPlatform', () => {
  it('maps known connect-route platform ids to Zernio platform slugs', () => {
    expect(toZernioPlatform('facebook')).toBe('facebook')
    expect(toZernioPlatform('google')).toBe('googlebusiness')
    expect(toZernioPlatform('linkedin')).toBe('linkedin')
    expect(toZernioPlatform('twitter')).toBe('twitter')
    expect(toZernioPlatform('tiktok')).toBe('tiktok')
    expect(toZernioPlatform('youtube')).toBe('youtube')
  })

  it('returns null for an unknown route id', () => {
    expect(toZernioPlatform('myspace')).toBeNull()
  })
})

describe('fromZernioPlatform', () => {
  it('maps known Zernio platform slugs to Prisma Platform enum values', () => {
    expect(fromZernioPlatform('facebook')).toBe('FACEBOOK')
    expect(fromZernioPlatform('googlebusiness')).toBe('GOOGLE_BUSINESS')
    expect(fromZernioPlatform('linkedin')).toBe('LINKEDIN')
    expect(fromZernioPlatform('twitter')).toBe('TWITTER')
    expect(fromZernioPlatform('tiktok')).toBe('TIKTOK')
    expect(fromZernioPlatform('youtube')).toBe('YOUTUBE')
    expect(fromZernioPlatform('instagram')).toBe('INSTAGRAM')
    expect(fromZernioPlatform('bluesky')).toBe('BLUESKY')
  })

  it('returns null for an unknown Zernio platform slug', () => {
    expect(fromZernioPlatform('myspace')).toBeNull()
  })
})

describe('platformEnumToZernioSlug', () => {
  it('maps known Prisma Platform enum values to Zernio platform slugs', () => {
    expect(platformEnumToZernioSlug('FACEBOOK')).toBe('facebook')
    expect(platformEnumToZernioSlug('GOOGLE_BUSINESS')).toBe('googlebusiness')
    expect(platformEnumToZernioSlug('LINKEDIN')).toBe('linkedin')
    expect(platformEnumToZernioSlug('TWITTER')).toBe('twitter')
    expect(platformEnumToZernioSlug('TIKTOK')).toBe('tiktok')
    expect(platformEnumToZernioSlug('YOUTUBE')).toBe('youtube')
    expect(platformEnumToZernioSlug('INSTAGRAM')).toBe('instagram')
    expect(platformEnumToZernioSlug('PINTEREST')).toBe('pinterest')
    expect(platformEnumToZernioSlug('THREADS')).toBe('threads')
    expect(platformEnumToZernioSlug('BLUESKY')).toBe('bluesky')
  })

  it('round-trips every Platform enum value through fromZernioPlatform(platformEnumToZernioSlug(...))', () => {
    const allPlatforms: Platform[] = [
      'FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'GOOGLE_BUSINESS', 'TWITTER',
      'TIKTOK', 'YOUTUBE', 'PINTEREST', 'THREADS', 'BLUESKY',
    ]
    for (const platform of allPlatforms) {
      expect(fromZernioPlatform(platformEnumToZernioSlug(platform))).toBe(platform)
    }
  })
})
