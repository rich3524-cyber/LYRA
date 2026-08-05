import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lyra-api-client')>()
  return { ...actual, callLyraApi: vi.fn() }
})

import { callLyraApi } from './lyra-api-client'
import { getWorkspaceName } from './get-workspace-name'

describe('getWorkspaceName', () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns the matching workspace name from the caller's workspace list", async () => {
    vi.mocked(callLyraApi).mockResolvedValue([
      { id: 'ws-1', name: 'Into The Wild Marketing' },
      { id: 'ws-2', name: 'LYRA' },
    ])

    const name = await getWorkspaceName('ws-2', 'token-abc')
    expect(name).toBe('LYRA')
    expect(callLyraApi).toHaveBeenCalledWith('/api/workspaces', 'token-abc')
  })

  it('returns null when the workspace_id has no match (should not happen in practice, but must not throw)', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([{ id: 'ws-1', name: 'Into The Wild Marketing' }])
    const name = await getWorkspaceName('ws-unknown', 'token-abc')
    expect(name).toBeNull()
  })

  it('resolves to null (never rejects) when the workspace list fetch fails, so a transient failure never fails the write', async () => {
    vi.mocked(callLyraApi).mockRejectedValue(new Error('network blip'))
    const name = await getWorkspaceName('ws-2', 'token-abc')
    expect(name).toBeNull()
  })
})
