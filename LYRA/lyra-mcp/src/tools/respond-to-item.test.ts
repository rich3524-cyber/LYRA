import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))

import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { respondToItem, GuardrailRefusalError } from './respond-to-item'

describe('respondToItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
  })

  it('returns the draft result as-is when the backend does not send', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ sent: false, draft: 'Thanks for reaching out!' })

    const result = await respondToItem({ workspace_id: 'ws-1', comment_id: 'c1' }, 'token-abc')

    expect(postLyraApi).toHaveBeenCalledWith('/api/mcp/respond-to-item', 'token-abc', {
      commentId: 'c1', responseText: undefined,
    })
    expect(result).toEqual({ sent: false, draft: 'Thanks for reaching out!' })
  })

  it('returns the sent result as-is when the backend actually sends', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ sent: true, response: 'Thanks for reaching out!' })
    const result = await respondToItem({ workspace_id: 'ws-1', comment_id: 'c1' }, 'token-abc')
    expect(result).toEqual({ sent: true, response: 'Thanks for reaching out!' })
  })

  it('throws a structured error when the backend refuses on a guardrail', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ sent: false, refused: true, rule: 'NEVER_DISCUSS', value: 'pricing' })

    await expect(
      respondToItem({ workspace_id: 'ws-1', comment_id: 'c1', response_text: 'our pricing is $99' }, 'token-abc')
    ).rejects.toThrow('Refused by guardrail: NEVER_DISCUSS - pricing')
  })

  it('throws a typed GuardrailRefusalError carrying rule/value, so callers can detect a refusal distinctly', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ sent: false, refused: true, rule: 'NEVER_DISCUSS', value: 'pricing' })

    const err = await respondToItem({ workspace_id: 'ws-1', comment_id: 'c1' }, 'token-abc').catch((e) => e)

    expect(err).toBeInstanceOf(GuardrailRefusalError)
    expect(err.rule).toBe('NEVER_DISCUSS')
    expect(err.value).toBe('pricing')
  })

  it('falls back to placeholder text in the error message when rule/value are missing from a malformed refusal payload', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ sent: false, refused: true })

    await expect(
      respondToItem({ workspace_id: 'ws-1', comment_id: 'c1' }, 'token-abc')
    ).rejects.toThrow('Refused by guardrail: unknown rule - unknown value')
  })

  it('returns successfully (not throw) on an escalation, with shouldEscalate/escalationReason intact -- distinct from a refusal', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({
      sent: false, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "refund"',
    })

    const result = await respondToItem({ workspace_id: 'ws-1', comment_id: 'c1' }, 'token-abc')

    expect(result).toEqual({
      sent: false, shouldEscalate: true, escalationReason: 'Contains escalation trigger: "refund"',
    })
  })

  it('propagates errors thrown by resolveWorkspaceId and never calls postLyraApi', async () => {
    vi.mocked(resolveWorkspaceId).mockRejectedValue(
      new Error('workspace_id is required: caller has access to multiple workspaces (A, B) -- specify which one')
    )

    await expect(
      respondToItem({ comment_id: 'c1' } as any, 'token-abc')
    ).rejects.toThrow('multiple workspaces')
    expect(postLyraApi).not.toHaveBeenCalled()
  })

  it('propagates errors from postLyraApi unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockRejectedValue(new LyraApiError(500, {}))

    await expect(
      respondToItem({ workspace_id: 'ws-1', comment_id: 'c1' }, 'token-abc')
    ).rejects.toThrow(LyraApiError)
  })

  it('passes response_text through when supplied', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ sent: false, draft: 'x' })
    await respondToItem({ workspace_id: 'ws-1', comment_id: 'c1', response_text: 'hand-typed reply' }, 'token-abc')
    expect(postLyraApi).toHaveBeenCalledWith('/api/mcp/respond-to-item', 'token-abc', {
      commentId: 'c1', responseText: 'hand-typed reply',
    })
  })

  it('resolves workspace_id implicitly (for disambiguation safety) even though the backend endpoint does not use it', async () => {
    vi.mocked(postLyraApi).mockResolvedValue({ sent: false, draft: 'x' })
    await respondToItem({ comment_id: 'c1' } as any, 'token-abc')
    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
  })
})
