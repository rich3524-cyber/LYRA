import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', () => ({ callLyraApi: vi.fn() }))

import { callLyraApi } from '../lyra-api-client'
import { getAnalytics } from './get-analytics'

describe('getAnalytics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls GET /api/analytics with workspace_id and default period, returns the response as-is', async () => {
    vi.mocked(callLyraApi).mockResolvedValue({ totalReach: 1000, engagementRate: 4.2 })

    const result = await getAnalytics({ workspace_id: 'ws-1' }, 'token-abc')

    expect(callLyraApi).toHaveBeenCalledWith('/api/analytics', 'token-abc', { workspaceId: 'ws-1', period: '30' })
    expect(result).toEqual({ totalReach: 1000, engagementRate: 4.2 })
  })

  it('passes through a custom period when given', async () => {
    vi.mocked(callLyraApi).mockResolvedValue({})
    await getAnalytics({ workspace_id: 'ws-1', period: 7 }, 'token-abc')
    expect(callLyraApi).toHaveBeenCalledWith('/api/analytics', 'token-abc', { workspaceId: 'ws-1', period: '7' })
  })

  it('throws when workspace_id is missing', async () => {
    await expect(getAnalytics({} as any, 'token-abc')).rejects.toThrow('workspace_id is required')
  })
})
