import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', () => ({ callLyraApi: vi.fn() }))

import { callLyraApi } from '../lyra-api-client'
import { listWorkspaces } from './list-workspaces'

describe('listWorkspaces', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls GET /api/workspaces with the bearer token and returns a compact shape', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([
      { id: 'ws-1', name: 'Into The Wild Marketing', industry: 'Professional Services', plan: 'AGENCY', role: 'AGENCY_ADMIN', platforms: ['FACEBOOK', 'INSTAGRAM'] },
      { id: 'ws-2', name: 'LYRA', industry: 'Technology', plan: 'PRO', role: 'AGENCY_ADMIN', platforms: [] },
    ])

    const result = await listWorkspaces({}, 'token-abc')

    expect(callLyraApi).toHaveBeenCalledWith('/api/workspaces', 'token-abc')
    expect(result).toEqual({
      workspaces: [
        { id: 'ws-1', name: 'Into The Wild Marketing', industry: 'Professional Services', plan: 'AGENCY', role: 'AGENCY_ADMIN', platforms: ['FACEBOOK', 'INSTAGRAM'] },
        { id: 'ws-2', name: 'LYRA', industry: 'Technology', plan: 'PRO', role: 'AGENCY_ADMIN', platforms: [] },
      ],
    })
  })
})
