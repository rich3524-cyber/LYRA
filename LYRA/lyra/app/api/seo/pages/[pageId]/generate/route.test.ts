import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    seoPage:    { findFirst: vi.fn(), update: vi.fn() },
    seoContent: { create: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit:  vi.fn(),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests, please try again shortly.' }), { status: 429 })),
}))
vi.mock('@/services/seo/on-page-analyzer', () => ({ analyzePage: vi.fn() }))
vi.mock('@/services/seo/content-generator', () => ({ generateSeoContent: vi.fn() }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { analyzePage } from '@/services/seo/on-page-analyzer'
import { generateSeoContent } from '@/services/seo/content-generator'
import { POST } from './route'

function ctx(pageId = 'page-1') {
  return { params: Promise.resolve({ pageId }) }
}

const PAGE = {
  id:        'page-1',
  url:       'https://example.com',
  workspace: { brandProfile: null },
}

describe('POST /api/seo/pages/[pageId]/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 19 })
    vi.mocked(prisma.seoPage.findFirst).mockResolvedValue(PAGE as never)
    vi.mocked(analyzePage).mockResolvedValue({ seoScore: 80 } as never)
    vi.mocked(generateSeoContent).mockResolvedValue({
      metaTitle: 'T', metaDescription: 'D', h1: 'H', intro: 'I',
    } as never)
    vi.mocked(prisma.seoContent.create).mockImplementation(
      (async ({ data }: { data: unknown }) => ({ id: 'content-1', ...(data as object) })) as never
    )
  })

  it('returns 429 without ever calling Claude when the rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })

    const res = await POST(new Request('http://localhost'), ctx())

    expect(res.status).toBe(429)
    expect(analyzePage).not.toHaveBeenCalled()
    expect(generateSeoContent).not.toHaveBeenCalled()
    expect(checkRateLimit).toHaveBeenCalledWith('seo-generate:user-1', 20, 60)
  })

  it('generates content for a page the user can access', async () => {
    const res = await POST(new Request('http://localhost'), ctx())
    expect(res.status).toBe(201)
    expect(prisma.seoContent.create).toHaveBeenCalledTimes(4)
  })

  it('returns 404 for a page outside the caller\'s workspace access', async () => {
    vi.mocked(prisma.seoPage.findFirst).mockResolvedValue(null)
    const res = await POST(new Request('http://localhost'), ctx())
    expect(res.status).toBe(404)
    expect(analyzePage).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(new Request('http://localhost'), ctx())
    expect(res.status).toBe(401)
  })
})
