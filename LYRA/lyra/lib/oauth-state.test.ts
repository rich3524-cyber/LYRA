import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { signState, verifyState } from './oauth-state'

describe('signState / verifyState', () => {
  it('round-trips a signed payload', () => {
    const state = signState({ workspaceId: 'ws_123', platform: 'FACEBOOK' })
    const payload = verifyState<{ workspaceId: string; platform: string }>(state)
    expect(payload).not.toBeNull()
    expect(payload?.workspaceId).toBe('ws_123')
    expect(payload?.platform).toBe('FACEBOOK')
  })

  it('rejects a tampered payload (signature no longer matches)', () => {
    const state = signState({ workspaceId: 'ws_123' })
    const [encoded, sig] = state.split('.')
    const tamperedEncoded = Buffer.from(JSON.stringify({ workspaceId: 'ws_attacker', iat: Date.now() })).toString('base64url')
    expect(verifyState(`${tamperedEncoded}.${sig}`)).toBeNull()
    // sanity: the original still verifies
    expect(verifyState(`${encoded}.${sig}`)).not.toBeNull()
  })

  it('rejects a wrong-length/malformed signature without throwing', () => {
    const state = signState({ workspaceId: 'ws_123' })
    const [encoded] = state.split('.')
    expect(() => verifyState(`${encoded}.not-a-real-signature`)).not.toThrow()
    expect(verifyState(`${encoded}.not-a-real-signature`)).toBeNull()
  })

  it('rejects null input', () => {
    expect(verifyState(null)).toBeNull()
  })

  it('rejects a state string missing the signature segment', () => {
    const state = signState({ workspaceId: 'ws_123' })
    const [encoded] = state.split('.')
    expect(verifyState(encoded)).toBeNull()
  })

  it('rejects malformed base64 payload without throwing', () => {
    const state = signState({ workspaceId: 'ws_123' })
    const [, sig] = state.split('.')
    expect(() => verifyState(`not-valid-base64!!!.${sig}`)).not.toThrow()
  })
})

describe('verifyState expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepts a state just under MAX_AGE_MS old', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const state = signState({ workspaceId: 'ws_123' })
    vi.advanceTimersByTime(10 * 60 * 1000 - 1000)
    expect(verifyState(state)).not.toBeNull()
  })

  it('rejects a state older than MAX_AGE_MS', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const state = signState({ workspaceId: 'ws_123' })
    vi.advanceTimersByTime(10 * 60 * 1000 + 1000)
    expect(verifyState(state)).toBeNull()
  })
})
