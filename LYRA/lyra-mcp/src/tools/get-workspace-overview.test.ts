import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', () => ({ callLyraApi: vi.fn() }))

import { callLyraApi } from '../lyra-api-client'
import { getWorkspaceOverview } from './get-workspace-overview'

describe('getWorkspaceOverview', () => {
  beforeEach(() => vi.clearAllMocks())

  it('composes workspace detail, pending approvals, inbox count, and crisis status into one response', async () => {
    vi.mocked(callLyraApi).mockImplementation(async (path: string) => {
      if (path === '/api/workspaces/ws-1') return { id: 'ws-1', name: 'ITWM', aiResponseMode: 'DRAFT_APPROVE', plan: 'AGENCY' }
      if (path === '/api/posts') return [{ id: 'p1' }, { id: 'p2' }]
      if (path === '/api/comments/unread-count') return { count: 5 }
      if (path === '/api/crisis/status') return { crisisActive: false, crisisTriggeredAt: null }
      throw new Error(`unexpected path: ${path}`)
    })

    const result = await getWorkspaceOverview({ workspace_id: 'ws-1' }, 'token-abc')

    expect(result).toEqual({
      workspace: { id: 'ws-1', name: 'ITWM', autonomyMode: 'DRAFT_APPROVE', plan: 'AGENCY' },
      pendingApprovalsCount: 2,
      inboxPendingCount: 5,
      crisisActive: false,
      errors: [],
    })

    expect(callLyraApi).toHaveBeenCalledWith('/api/workspaces/ws-1', 'token-abc')
    expect(callLyraApi).toHaveBeenCalledWith('/api/posts', 'token-abc', { workspaceId: 'ws-1', status: 'PENDING_APPROVAL' })
    expect(callLyraApi).toHaveBeenCalledWith('/api/comments/unread-count', 'token-abc', { workspaceId: 'ws-1' })
    expect(callLyraApi).toHaveBeenCalledWith('/api/crisis/status', 'token-abc', { workspaceId: 'ws-1' })
  })

  it('returns partial data with an errors list when one of the four calls fails, and never coerces a failed crisis check to false', async () => {
    vi.mocked(callLyraApi).mockImplementation(async (path: string) => {
      if (path === '/api/workspaces/ws-1') return { id: 'ws-1', name: 'ITWM', aiResponseMode: 'DRAFT_APPROVE', plan: 'AGENCY' }
      if (path === '/api/posts') return [{ id: 'p1' }, { id: 'p2' }]
      if (path === '/api/comments/unread-count') throw new Error('transient failure')
      if (path === '/api/crisis/status') return { crisisActive: false, crisisTriggeredAt: null }
      throw new Error(`unexpected path: ${path}`)
    })

    const result = await getWorkspaceOverview({ workspace_id: 'ws-1' }, 'token-abc')

    expect(result).toEqual({
      workspace: { id: 'ws-1', name: 'ITWM', autonomyMode: 'DRAFT_APPROVE', plan: 'AGENCY' },
      pendingApprovalsCount: 2,
      inboxPendingCount: null,
      crisisActive: false,
      errors: ['inboxPendingCount'],
    })
  })

  it('reports crisisActive as null (not false) when the crisis status call itself fails', async () => {
    vi.mocked(callLyraApi).mockImplementation(async (path: string) => {
      if (path === '/api/workspaces/ws-1') return { id: 'ws-1', name: 'ITWM', aiResponseMode: 'DRAFT_APPROVE', plan: 'AGENCY' }
      if (path === '/api/posts') return [{ id: 'p1' }, { id: 'p2' }]
      if (path === '/api/comments/unread-count') return { count: 5 }
      if (path === '/api/crisis/status') throw new Error('transient failure')
      throw new Error(`unexpected path: ${path}`)
    })

    const result = await getWorkspaceOverview({ workspace_id: 'ws-1' }, 'token-abc')

    expect(result).toEqual({
      workspace: { id: 'ws-1', name: 'ITWM', autonomyMode: 'DRAFT_APPROVE', plan: 'AGENCY' },
      pendingApprovalsCount: 2,
      inboxPendingCount: 5,
      crisisActive: null,
      errors: ['crisisActive'],
    })
  })

  it('throws a structured error when workspace_id is missing', async () => {
    await expect(getWorkspaceOverview({} as any, 'token-abc')).rejects.toThrow('workspace_id is required')
    expect(callLyraApi).not.toHaveBeenCalled()
  })
})
