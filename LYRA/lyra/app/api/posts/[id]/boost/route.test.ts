import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post:       { findFirst: vi.fn(), findUnique: vi.fn() },
    postBoost:  { deleteMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/encrypt', () => ({ decrypt: vi.fn(() => 'plain-token') }))
vi.mock('@/services/social/meta-ads', () => ({ createBoost: vi.fn(), cancelBoost: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit:    vi.fn(),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests, please try again shortly.' }), { status: 429 })),
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createBoost } from '@/services/social/meta-ads'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function ctx(id = 'post-1') {
  return { params: Promise.resolve({ id }) }
}

function req(body: unknown) {
  return new Request('http://localhost', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

const BODY = { budget: 2500, durationDays: 7, audience: 'followers' as const }

const PUBLISHED_POST = {
  id:             'post-1',
  status:         'PUBLISHED',
  platformPostId: 'plat-1',
  workspace:      { id: 'ws-1', plan: 'PRO' },
  socialAccount: {
    platform:      'FACEBOOK',
    platformId:    'page-1',
    adAccountId:   'act_1',
    accessToken:   'encrypted-token',
  },
}

describe('POST /api/posts/[id]/boost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9 })
    vi.mocked(prisma.post.findFirst).mockResolvedValue(PUBLISHED_POST as never)
    vi.mocked(createBoost).mockResolvedValue({ adCampaignId: 'c1', adSetId: 's1', adId: 'a1' } as never)
    vi.mocked(prisma.postBoost.create).mockImplementation(
      (async ({ data }: { data: unknown }) => ({ id: 'boost-1', ...(data as object) })) as never
    )
  })

  it('returns 429 without calling Meta when the rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })
    const res = await POST(req(BODY), ctx())
    expect(res.status).toBe(429)
    expect(createBoost).not.toHaveBeenCalled()
    expect(checkRateLimit).toHaveBeenCalledWith('boost-create:user-1', 10, 300)
  })

  it('creates a boost for a valid published post', async () => {
    const res = await POST(req(BODY), ctx())
    expect(res.status).toBe(201)
    expect(createBoost).toHaveBeenCalledTimes(1)
  })

  it('rejects an unlisted budget value', async () => {
    const res = await POST(req({ ...BODY, budget: 999 }), ctx())
    expect(res.status).toBe(400)
    expect(createBoost).not.toHaveBeenCalled()
  })

  it('rejects boosting on a STARTER-plan workspace', async () => {
    vi.mocked(prisma.post.findFirst).mockResolvedValue({
      ...PUBLISHED_POST,
      workspace: { id: 'ws-1', plan: 'STARTER' },
    } as never)
    const res = await POST(req(BODY), ctx())
    expect(res.status).toBe(403)
    expect(createBoost).not.toHaveBeenCalled()
  })

  it('returns 404/403 for a post outside the caller\'s workspace access', async () => {
    vi.mocked(prisma.post.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.post.findUnique).mockResolvedValue(null as never)
    const res = await POST(req(BODY), ctx())
    expect(res.status).toBe(404)
    expect(createBoost).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req(BODY), ctx())
    expect(res.status).toBe(401)
  })
})
