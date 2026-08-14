// services/comments/sync.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    comment: { createManyAndReturn: vi.fn() },
    socialAccount: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/encrypt', () => ({ decrypt: vi.fn(() => 'plain-token') }))
vi.mock('@/services/social/linkedin', () => ({
  getOrgPosts: vi.fn(),
  getPostComments: vi.fn(),
}))
vi.mock('@/services/social/provider', () => ({ getProvider: vi.fn() }))

import { prisma } from '@/lib/prisma'
import * as linkedin from '@/services/social/linkedin'
import { getProvider } from '@/services/social/provider'
import { filterSelfComments, syncAccountComments, syncWorkspaceComments } from './sync'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.comment.createManyAndReturn).mockImplementation(
    (async ({ data }: { data: unknown[] }) => data.map((d, i) => ({ id: `c${i}`, ...(d as object) }))) as never
  )
})

describe('filterSelfComments', () => {
  const comments = [
    { externalId: '1', postExternalId: 'p1', authorName: 'My Page', text: 'hi', createdAt: new Date() },
    { externalId: '2', postExternalId: 'p1', authorName: 'Jane', authorHandle: '@mypage', text: 'yo', createdAt: new Date() },
    { externalId: '3', postExternalId: 'p1', authorName: 'Real Fan', authorHandle: '@fan', text: 'nice', createdAt: new Date() },
  ]

  it('drops comments authored by the account itself (matched by name)', () => {
    const result = filterSelfComments(comments, { name: 'My Page', handle: null })
    expect(result.map((c) => c.externalId)).toEqual(['2', '3'])
  })

  it('drops comments authored by the account itself (matched by handle)', () => {
    const result = filterSelfComments(comments, { name: null, handle: '@mypage' })
    expect(result.map((c) => c.externalId)).toEqual(['1', '3'])
  })

  it('matches case-insensitively', () => {
    const result = filterSelfComments(comments, { name: 'MY PAGE', handle: null })
    expect(result.map((c) => c.externalId)).toEqual(['2', '3'])
  })

  it('keeps everything when the account has no name or handle to compare', () => {
    const result = filterSelfComments(comments, { name: null, handle: null })
    expect(result).toHaveLength(3)
  })
})

function zernioAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    provider: 'ZERNIO',
    zernioAccountId: 'z1',
    platform: 'INSTAGRAM',
    platformId: 'ig-1',
    accessToken: null,
    name: 'My Page',
    handle: null,
    ...overrides,
  }
}

describe('syncAccountComments — Zernio-routed accounts', () => {
  it('fetches via the provider, filters self-comments, and creates the rest', async () => {
    const fetchRecentComments = vi.fn().mockResolvedValue([
      { externalId: '1', postExternalId: 'p1', authorName: 'My Page', text: 'hi', createdAt: new Date('2026-01-01') },
      { externalId: '2', postExternalId: 'p1', authorName: 'Jane', text: 'nice post', createdAt: new Date('2026-01-02') },
    ])
    vi.mocked(getProvider).mockReturnValue({ fetchRecentComments } as never)

    const count = await syncAccountComments(zernioAccount() as never, 'ws-1')

    expect(count).toBe(1)
    expect(prisma.comment.createManyAndReturn).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        workspaceId: 'ws-1',
        socialAccountId: 'acc-1',
        platformCommentId: '2',
        platformPostId: 'p1',
        authorName: 'Jane',
        content: 'nice post',
        status: 'PENDING',
      })],
      skipDuplicates: true,
    })
  })

  it('returns 0 and logs without throwing when the provider fetch fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getProvider).mockReturnValue({
      fetchRecentComments: vi.fn().mockRejectedValue(new Error('zernio down')),
    } as never)

    const count = await syncAccountComments(zernioAccount() as never, 'ws-1')

    expect(count).toBe(0)
    expect(prisma.comment.createManyAndReturn).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('returns 0 without a DB call when there are no new comments after filtering', async () => {
    vi.mocked(getProvider).mockReturnValue({
      fetchRecentComments: vi.fn().mockResolvedValue([
        { externalId: '1', postExternalId: 'p1', authorName: 'My Page', text: 'hi', createdAt: new Date() },
      ]),
    } as never)

    const count = await syncAccountComments(zernioAccount() as never, 'ws-1')

    expect(count).toBe(0)
    expect(prisma.comment.createManyAndReturn).not.toHaveBeenCalled()
  })
})

function directAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-2',
    provider: 'NATIVE',
    zernioAccountId: null,
    platform: 'FACEBOOK',
    platformId: 'fb-1',
    accessToken: 'enc-token',
    name: null,
    handle: null,
    ...overrides,
  }
}

describe('syncAccountComments — direct (non-Zernio) accounts', () => {
  it('skips an account with no access token', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const count = await syncAccountComments(directAccount({ accessToken: null }) as never, 'ws-1')
    expect(count).toBe(0)
    expect(prisma.comment.createManyAndReturn).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('fetches and normalizes Facebook comments', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: [{ comments: { data: [{ id: 'c1', message: 'hey', from: { name: 'Alice' }, created_time: '2026-01-01T00:00:00Z' }] } }],
      }),
    }) as never

    const count = await syncAccountComments(directAccount({ platform: 'FACEBOOK' }) as never, 'ws-1')

    expect(count).toBe(1)
    expect(prisma.comment.createManyAndReturn).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        workspaceId: 'ws-1', socialAccountId: 'acc-2', platformCommentId: 'c1', authorName: 'Alice', content: 'hey',
      })],
      skipDuplicates: true,
    })
  })

  it('fetches and normalizes Instagram comments', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        data: [{ comments: { data: [{ id: 'ig1', text: 'love it', username: 'bob', timestamp: '2026-01-01T00:00:00Z' }] } }],
      }),
    }) as never

    const count = await syncAccountComments(directAccount({ platform: 'INSTAGRAM' }) as never, 'ws-1')

    expect(count).toBe(1)
    expect(prisma.comment.createManyAndReturn).toHaveBeenCalledWith({
      data: [expect.objectContaining({ platformCommentId: 'ig1', authorName: 'bob', content: 'love it' })],
      skipDuplicates: true,
    })
  })

  it('fetches and normalizes LinkedIn comments via org posts', async () => {
    vi.mocked(linkedin.getOrgPosts).mockResolvedValue([{ urn: 'urn:li:share:1' }] as never)
    vi.mocked(linkedin.getPostComments).mockResolvedValue([
      { commentUrn: 'urn:li:comment:1', text: 'great read', createdAt: 1735689600000 },
    ] as never)

    const count = await syncAccountComments(directAccount({ platform: 'LINKEDIN' }) as never, 'ws-1')

    expect(count).toBe(1)
    expect(prisma.comment.createManyAndReturn).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        platformCommentId: 'urn:li:comment:1', authorName: 'LinkedIn Member', content: 'great read',
      })],
      skipDuplicates: true,
    })
  })

  it('returns 0 and logs without throwing when the fetch throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as never

    const count = await syncAccountComments(directAccount({ platform: 'FACEBOOK' }) as never, 'ws-1')

    expect(count).toBe(0)
    expect(prisma.comment.createManyAndReturn).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('syncWorkspaceComments', () => {
  it('loads active FB/IG/LinkedIn accounts and sums per-account new counts', async () => {
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([
      zernioAccount({ id: 'acc-1' }),
      zernioAccount({ id: 'acc-2' }),
    ] as never)
    vi.mocked(getProvider).mockReturnValue({
      fetchRecentComments: vi.fn().mockResolvedValue([
        { externalId: 'x', postExternalId: 'p', authorName: 'Someone', text: 'hey', createdAt: new Date() },
      ]),
    } as never)

    const total = await syncWorkspaceComments('ws-1')

    expect(prisma.socialAccount.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', isActive: true, platform: { in: ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN'] } },
    })
    expect(total).toBe(2)
  })

  it('returns 0 when the workspace has no matching accounts', async () => {
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([])
    const total = await syncWorkspaceComments('ws-1')
    expect(total).toBe(0)
  })
})
