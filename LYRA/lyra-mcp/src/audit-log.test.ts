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

  it('truncates an oversized errorMessage and params before posting', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ ok: true })

    const hugeErrorMessage = 'x'.repeat(3000)
    const hugeParams = { blob: 'y'.repeat(60_000) }

    await logAuditEvent('token-abc', {
      workspaceId: 'ws-1', toolName: 'schedule_post', params: hugeParams, outcome: 'ERROR', errorMessage: hugeErrorMessage,
    })

    expect(postLyraApi).toHaveBeenCalledTimes(1)
    const [, , sentEvent] = vi.mocked(postLyraApi).mock.calls[0] as [string, string, Record<string, unknown>]

    expect((sentEvent.errorMessage as string).length).toBe(2000)
    expect(sentEvent.params).toEqual({ truncated: true, originalLength: JSON.stringify(hugeParams).length })
  })
})
