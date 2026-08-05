import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./lyra-api-client', () => ({ postLyraApi: vi.fn() }))

import { postLyraApi } from './lyra-api-client'
import { logAuditEvent } from './audit-log'

describe('logAuditEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('POSTs the audit event to the LYRA API', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ ok: true })

    await logAuditEvent('token-abc', {
      workspaceId: 'ws-1', toolName: 'schedule_post', params: { content: 'x' }, outcome: 'SUCCESS',
    })

    expect(postLyraApi).toHaveBeenCalledWith('/api/mcp/audit', 'token-abc', {
      workspaceId: 'ws-1', toolName: 'schedule_post', params: { content: 'x' }, outcome: 'SUCCESS',
    })
  })

  it('swallows and logs an error from postLyraApi rather than throwing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(postLyraApi).mockRejectedValue(new Error('network down'))

    await expect(
      logAuditEvent('token-abc', { workspaceId: 'ws-1', toolName: 'x', params: {}, outcome: 'ERROR', errorMessage: 'boom' })
    ).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
