import { describe, it, expect } from 'vitest'
import { hasCrisisAwareAccess, hasNotificationChannelAccess } from './plan-access'

describe('hasCrisisAwareAccess', () => {
  it('grants AGENCY plan access with no subscription needed', () => {
    expect(hasCrisisAwareAccess('AGENCY', null)).toBe(true)
  })

  it('denies STARTER regardless of a crisisAwareSubId', () => {
    expect(hasCrisisAwareAccess('STARTER', 'sub_123')).toBe(false)
  })

  it('denies PRO with no crisisAwareSubId', () => {
    expect(hasCrisisAwareAccess('PRO', null)).toBe(false)
    expect(hasCrisisAwareAccess('PRO', undefined)).toBe(false)
    expect(hasCrisisAwareAccess('PRO', '')).toBe(false)
  })

  it('grants PRO with a real crisisAwareSubId', () => {
    expect(hasCrisisAwareAccess('PRO', 'sub_123')).toBe(true)
  })
})

describe('hasNotificationChannelAccess', () => {
  it('grants AGENCY plan access with no subscription needed', () => {
    expect(hasNotificationChannelAccess('AGENCY', null)).toBe(true)
  })

  it('denies STARTER regardless of a crisisAwareSubId', () => {
    expect(hasNotificationChannelAccess('STARTER', 'sub_123')).toBe(false)
  })

  it('denies PRO with no crisisAwareSubId', () => {
    expect(hasNotificationChannelAccess('PRO', null)).toBe(false)
  })

  it('grants PRO with a real crisisAwareSubId', () => {
    expect(hasNotificationChannelAccess('PRO', 'sub_123')).toBe(true)
  })
})
