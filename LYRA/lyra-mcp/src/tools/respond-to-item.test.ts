import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))

import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { respondToItem } from './respond-to-item'

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
