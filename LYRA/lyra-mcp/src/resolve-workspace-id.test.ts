import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lyra-api-client')>()
  return { ...actual, callLyraApi: vi.fn() }
})

import { callLyraApi } from './lyra-api-client'
import { resolveWorkspaceId, AmbiguousWorkspaceError } from './resolve-workspace-id'

describe('resolveWorkspaceId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns workspace_id unchanged when provided, without calling the API', async () => {
    const result = await resolveWorkspaceId('ws-1', 'token-abc')
    expect(result).toBe('ws-1')
    expect(callLyraApi).not.toHaveBeenCalled()
  })

  it('resolves implicitly when omitted and the caller has exactly one workspace', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([{ id: 'ws-only', name: 'Solo Co' }])
    const result = await resolveWorkspaceId(undefined, 'token-abc')
    expect(result).toBe('ws-only')
    expect(callLyraApi).toHaveBeenCalledWith('/api/workspaces', 'token-abc')
  })

  it('throws a structured, name-bearing AmbiguousWorkspaceError when omitted and the caller has more than one workspace', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([
      { id: 'ws-1', name: 'Into The Wild Marketing' },
      { id: 'ws-2', name: 'LYRA' },
    ])
    await expect(resolveWorkspaceId(undefined, 'token-abc')).rejects.toThrow(
      'workspace_id is required: caller has access to multiple workspaces (Into The Wild Marketing, LYRA) -- specify which one'
    )
    // Distinct error class (not a bare Error) so callers like
    // searchCapabilities can catch specifically this ambiguous-workspace
    // case and let every other failure mode propagate -- see
    // AmbiguousWorkspaceError's doc comment.
    await expect(resolveWorkspaceId(undefined, 'token-abc')).rejects.toBeInstanceOf(AmbiguousWorkspaceError)
  })

  it('throws a plain Error (NOT AmbiguousWorkspaceError) when omitted and the caller has no workspaces at all -- a different failure mode that specifying workspace_id can\'t fix', async () => {
    vi.mocked(callLyraApi).mockResolvedValue([])
    await expect(resolveWorkspaceId(undefined, 'token-abc')).rejects.toThrow('no workspaces')
    await expect(resolveWorkspaceId(undefined, 'token-abc')).rejects.not.toBeInstanceOf(AmbiguousWorkspaceError)
  })
})
