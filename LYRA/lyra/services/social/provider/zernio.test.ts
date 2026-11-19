import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../zernio-client', () => ({
  zernioClient: {
    listCommentedPosts: vi.fn(),
    getPostComments:    vi.fn(),
  },
  ZernioApiError: class ZernioApiError extends Error {
    constructor(public status: number, message: string, public body?: unknown) {
      super(message)
    }
  },
}))

import { zernioClient } from '../zernio-client'
import { zernioProvider } from './zernio'

function account(overrides: Record<string, unknown> = {}) {
  return {
    id:              'sa-tenmore-ig',
    workspaceId:     'ws-tenmore',
    platform:        'INSTAGRAM',
    provider:        'ZERNIO',
    zernioAccountId: 'zac_tenmore',
    ...overrides,
  } as never
}

describe('zernioProvider.fetchRecentComments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(zernioClient.listCommentedPosts).mockResolvedValue({ data: [] })
    vi.mocked(zernioClient.getPostComments).mockResolvedValue({ comments: [] })
  })

  // The whole point. GET /inbox/comments without an accountId "aggregates data
  // across multiple accounts" -- and because ZERNIO_API_KEY is one master key
  // spanning every LYRA workspace, that means every tenant's accounts. The post
  // ids that come back are then fed to getPostComments with THIS account's id,
  // and Meta refuses anything the account does not own:
  //   "Object with ID '...' does not exist, cannot be loaded due to missing
  //    permissions"
  // Confirmed live 2026-11-19 against a brand-new Tenmore Instagram account,
  // which was handed 8 posts belonging to the LYRA workspace's account.
  it('scopes the commented-posts listing to this account, not every connected account', async () => {
    await zernioProvider.fetchRecentComments(account())

    expect(zernioClient.listCommentedPosts).toHaveBeenCalledWith('instagram', 'zac_tenmore')
  })

  it('never lists posts unscoped, whatever the platform', async () => {
    await zernioProvider.fetchRecentComments(account({ platform: 'FACEBOOK', zernioAccountId: 'zac_fb' }))

    const [, accountIdArg] = vi.mocked(zernioClient.listCommentedPosts).mock.calls[0]
    expect(accountIdArg).toBe('zac_fb')
  })

  it('fetches comments for each returned post using the same account id', async () => {
    vi.mocked(zernioClient.listCommentedPosts).mockResolvedValue({
      data: [{ id: 'post-1' }, { id: 'post-2' }],
    })

    await zernioProvider.fetchRecentComments(account())

    expect(zernioClient.getPostComments).toHaveBeenCalledWith('post-1', 'zac_tenmore')
    expect(zernioClient.getPostComments).toHaveBeenCalledWith('post-2', 'zac_tenmore')
  })

  it('maps a returned comment onto the post it came from', async () => {
    vi.mocked(zernioClient.listCommentedPosts).mockResolvedValue({ data: [{ id: 'post-1' }] })
    vi.mocked(zernioClient.getPostComments).mockResolvedValue({
      comments: [
        {
          id:          'c-1',
          message:     'nice one',
          createdTime: '2026-11-19T01:00:00.000Z',
          from:        { id: 'u-1', username: 'someone' },
        },
      ],
    })

    const result = await zernioProvider.fetchRecentComments(account())

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ externalId: 'c-1', postExternalId: 'post-1' })
  })

  it('refuses to sync an account with no zernioAccountId rather than listing unscoped', async () => {
    await expect(
      zernioProvider.fetchRecentComments(account({ zernioAccountId: null }))
    ).rejects.toThrow(/no zernioAccountId/)

    expect(zernioClient.listCommentedPosts).not.toHaveBeenCalled()
  })
})
