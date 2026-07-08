import { describe, it, expect } from 'vitest'
import { getProvider } from './index'
import { zernioProvider } from './zernio'
import { nativeProvider } from './native'

describe('getProvider', () => {
  it('returns the Zernio provider for ZERNIO accounts', () => {
    expect(getProvider({ provider: 'ZERNIO' })).toBe(zernioProvider)
  })
  it('returns the native provider for NATIVE accounts', () => {
    expect(getProvider({ provider: 'NATIVE' })).toBe(nativeProvider)
  })
})
