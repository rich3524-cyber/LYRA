import { describe, it, expect } from 'vitest'
import { getAuthSub } from './auth-context'

describe('getAuthSub', () => {
  it('returns the sub when present and a non-empty string', () => {
    expect(getAuthSub({ extra: { sub: 'auth0|user123' } })).toBe('auth0|user123')
  })

  it('returns null when authInfo itself is undefined', () => {
    expect(getAuthSub(undefined)).toBeNull()
  })

  it('returns null when extra is undefined', () => {
    expect(getAuthSub({})).toBeNull()
  })

  it('returns null when extra.sub is undefined', () => {
    expect(getAuthSub({ extra: {} })).toBeNull()
  })

  it('returns null when extra.sub is present but not a string (e.g. a number)', () => {
    expect(getAuthSub({ extra: { sub: 12345 } })).toBeNull()
  })

  it('returns null when extra.sub is an empty string', () => {
    expect(getAuthSub({ extra: { sub: '' } })).toBeNull()
  })
})
