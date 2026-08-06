import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, callLyraApi: vi.fn() }
})

import { callLyraApi } from '../lyra-api-client'
import { meetsPlanTier } from './plan-tier'

describe('meetsPlanTier', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when the workspace plan meets the minimum tier', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([{ id: 'ws-1', plan: 'PRO' }])
    const result = await meetsPlanTier('ws-1', 'PRO', 'token-abc')
    expect(result).toBe(true)
  })

  it('returns true when the workspace plan exceeds the minimum tier', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([{ id: 'ws-1', plan: 'AGENCY' }])
    const result = await meetsPlanTier('ws-1', 'PRO', 'token-abc')
    expect(result).toBe(true)
  })

  it('returns false when the workspace plan is below the minimum tier', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([{ id: 'ws-1', plan: 'STARTER' }])
    const result = await meetsPlanTier('ws-1', 'PRO', 'token-abc')
    expect(result).toBe(false)
  })

  it('always allows when the minimum tier is STARTER, regardless of the workspace lookup', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([{ id: 'ws-1', plan: 'STARTER' }])
    const result = await meetsPlanTier('ws-1', 'STARTER', 'token-abc')
    expect(result).toBe(true)
    expect(callLyraApi).not.toHaveBeenCalled()
  })

  it('returns false (fail-closed) if the workspace cannot be found in the caller\'s list', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([{ id: 'ws-other', plan: 'AGENCY' }])
    const result = await meetsPlanTier('ws-1', 'PRO', 'token-abc')
    expect(result).toBe(false)
  })
})
