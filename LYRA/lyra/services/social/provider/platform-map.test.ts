import { describe, it, expect } from 'vitest'
import { toZernioPlatform, fromZernioPlatform } from './platform-map'

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
