import { describe, it, expect } from 'vitest'
import { getProvider } from './index'
import { zernioProvider } from './zernio'
import { nativeProvider } from './native'

describe('getProvider', () => {
  it('returns the Zernio provider for ZERNIO accounts with a zernioAccountId', () => {
    expect(getProvider({ provider: 'ZERNIO', zernioAccountId: 'zac_123' })).toBe(zernioProvider)
  })
  it('returns the native provider for NATIVE accounts', () => {
    expect(getProvider({ provider: 'NATIVE', zernioAccountId: null })).toBe(nativeProvider)
  })
  it('returns the native provider for ZERNIO-labeled accounts with no zernioAccountId (mislabeled/unmigrated)', () => {
    expect(getProvider({ provider: 'ZERNIO', zernioAccountId: null })).toBe(nativeProvider)
  })
})
