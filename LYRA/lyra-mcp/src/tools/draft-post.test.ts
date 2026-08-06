import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lyra-api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lyra-api-client')>()
  return { ...actual, callLyraApi: vi.fn(), postLyraApi: vi.fn() }
})
vi.mock('../resolve-workspace-id', () => ({ resolveWorkspaceId: vi.fn() }))
vi.mock('../get-workspace-name', () => ({ getWorkspaceName: vi.fn() }))

import { callLyraApi, postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getWorkspaceName } from '../get-workspace-name'
import { draftPost } from './draft-post'

describe('draftPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveWorkspaceId).mockResolvedValue('ws-1')
    vi.mocked(getWorkspaceName).mockResolvedValue('Into The Wild Marketing')
  })

  it('scores the content, creates the post, and returns both plus workspace echo-back', async () => {
    vi.mocked(postLyraApi).mockImplementation(async (path: string) => {
      if (path === '/api/ai/score-content') {
        return { overallScore: 78, dimensions: { hook: { score: 8, suggestion: null }, clarity: { score: 7, suggestion: 'Tighten the opener' } } }
      }
      return [{ id: 'p1', status: 'DRAFT', socialAccount: { platform: 'FACEBOOK', name: 'ITWM Page' } }]
    })

    const result = await draftPost(
      { workspace_id: 'ws-1', content: 'Check out our new service!', platforms: ['FACEBOOK'] },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/ai/score-content', 'token-abc', {
      content: 'Check out our new service!', platform: 'FACEBOOK', workspaceId: 'ws-1',
    })
    expect(postLyraApi).toHaveBeenCalledWith('/api/posts', 'token-abc', {
      workspaceId: 'ws-1', content: 'Check out our new service!', platforms: ['FACEBOOK'], status: 'DRAFT',
    })
    expect(result).toEqual({
      workspaceName: 'Into The Wild Marketing',
      posts: [{ id: 'p1', status: 'DRAFT', platform: 'FACEBOOK', accountName: 'ITWM Page' }],
      score: {
        overallScore: 78,
        dimensions: { hook: { score: 8, suggestion: null }, clarity: { score: 7, suggestion: 'Tighten the opener' } },
        scoredForPlatform: 'FACEBOOK',
      },
    })
  })

  it('resolves workspace_id implicitly when omitted', async () => {
    vi.mocked(postLyraApi).mockImplementation(async (path: string) => {
      if (path === '/api/ai/score-content') return { overallScore: 50, dimensions: {} }
      return []
    })

    await draftPost({ content: 'hi', platforms: ['FACEBOOK'] } as any, 'token-abc')

    expect(resolveWorkspaceId).toHaveBeenCalledWith(undefined, 'token-abc')
  })

  it('propagates errors from postLyraApi unchanged', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockImplementation(async (path: string) => {
      if (path === '/api/ai/score-content') return { overallScore: 50, dimensions: {} }
      throw new LyraApiError(422, {})
    })

    await expect(draftPost({ content: 'hi', platforms: ['FACEBOOK'] } as any, 'token-abc')).rejects.toThrow(LyraApiError)
  })

  it('never lets a scoring failure block draft creation -- resolves with score: null and the real posts array', async () => {
    const { LyraApiError } = await import('../lyra-api-client')
    vi.mocked(postLyraApi).mockImplementation(async (path: string) => {
      if (path === '/api/ai/score-content') throw new LyraApiError(422, { error: 'Content too short to score.' })
      return [{ id: 'p1', status: 'DRAFT', socialAccount: { platform: 'FACEBOOK', name: 'ITWM Page' } }]
    })

    const result = await draftPost({ workspace_id: 'ws-1', content: 'hi', platforms: ['FACEBOOK'] }, 'token-abc')

    expect(result).toEqual({
      workspaceName: 'Into The Wild Marketing',
      posts: [{ id: 'p1', status: 'DRAFT', platform: 'FACEBOOK', accountName: 'ITWM Page' }],
      score: null,
    })
  })

  it('scores only platforms[0] when multiple platforms are requested, and labels the score with that platform', async () => {
    vi.mocked(postLyraApi).mockImplementation(async (path: string) => {
      if (path === '/api/ai/score-content') return { overallScore: 60, dimensions: {} }
      return [
        { id: 'p1', status: 'DRAFT', socialAccount: { platform: 'LINKEDIN', name: 'ITWM LinkedIn' } },
        { id: 'p2', status: 'DRAFT', socialAccount: { platform: 'TWITTER', name: 'ITWM Twitter' } },
      ]
    })

    const result = await draftPost(
      { workspace_id: 'ws-1', content: 'A long-form update for LinkedIn', platforms: ['LINKEDIN', 'TWITTER'] },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/ai/score-content', 'token-abc', {
      content: 'A long-form update for LinkedIn', platform: 'LINKEDIN', workspaceId: 'ws-1',
    })
    expect(result.score).toEqual({ overallScore: 60, dimensions: {}, scoredForPlatform: 'LINKEDIN' })
  })

  it('forwards media_urls to the backend when provided', async () => {
    vi.mocked(postLyraApi).mockImplementation((path) =>
      path === '/api/posts'
        ? Promise.resolve([{ id: 'post-1', status: 'DRAFT', socialAccount: { platform: 'INSTAGRAM', name: 'Acme' } }])
        : Promise.resolve({ overallScore: 80, dimensions: {} })
    )

    await draftPost(
      { workspace_id: 'ws-1', content: 'A caption', platforms: ['INSTAGRAM'], media_urls: ['https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg'] },
      'token-abc'
    )

    expect(postLyraApi).toHaveBeenCalledWith('/api/posts', 'token-abc', expect.objectContaining({
      mediaUrls: ['https://lyra-media.s3.ap-southeast-2.amazonaws.com/media/ws-1/photo.jpg'],
    }))
  })

  it('omits mediaUrls from the backend call entirely when not provided', async () => {
    vi.mocked(postLyraApi).mockImplementation((path) =>
      path === '/api/posts'
        ? Promise.resolve([{ id: 'post-1', status: 'DRAFT', socialAccount: { platform: 'INSTAGRAM', name: 'Acme' } }])
        : Promise.resolve({ overallScore: 80, dimensions: {} })
    )

    await draftPost({ workspace_id: 'ws-1', content: 'A caption', platforms: ['INSTAGRAM'] }, 'token-abc')

    const postsCall = vi.mocked(postLyraApi).mock.calls.find(([path]) => path === '/api/posts')
    expect(postsCall?.[2]).not.toHaveProperty('mediaUrls')
  })
})
