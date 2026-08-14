import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: { findFirst: vi.fn() },
    post:      { findMany: vi.fn() },
  },
}))
vi.mock('@/services/reports/narrative-generator', () => ({
  generateNarrative: vi.fn().mockResolvedValue('Great month for engagement.'),
}))
vi.mock('@/services/reports/report-renderer', () => ({
  renderReport: vi.fn().mockResolvedValue(Buffer.from('PDF-BYTES')),
}))
// Fake in-memory Redis store backing both boundaries this route touches
// through lib/redis.ts's shared redisClient: lib/rate-limit.ts's `eval`
// script, and lib/cache.ts's get/set/getBuffer. Letting both run for real
// against this fake (rather than mocking lib/rate-limit or lib/cache
// directly) is what lets the cross-workspace-leak test below actually prove
// the cache key the route builds is workspace-scoped. Same "mock the Redis
// boundary itself" pattern as app/api/mcp/audit/route.test.ts.
const fakeRedisStore = new Map<string, string | Buffer>()
vi.mock('@/lib/redis', () => ({
  redis: {},
  redisClient: {
    eval: vi.fn().mockResolvedValue(1),
    get: vi.fn((key: string) => Promise.resolve((fakeRedisStore.get(key) as string) ?? null)),
    getBuffer: vi.fn((key: string) => {
      const v = fakeRedisStore.get(key)
      return Promise.resolve(v === undefined ? null : Buffer.from(v as Buffer))
    }),
    set: vi.fn((key: string, value: string | Buffer) => {
      fakeRedisStore.set(key, value)
      return Promise.resolve('OK')
    }),
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redisClient } from '@/lib/redis'
import { generateNarrative } from '@/services/reports/narrative-generator'
import { renderReport } from '@/services/reports/report-renderer'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/reports/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function fakePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    content: 'Hello world',
    publishedAt: new Date(),
    socialAccount: { platform: 'INSTAGRAM' },
    metrics: { likes: 10, comments: 2, shares: 1, impressions: 100, reach: 90, views: 120 },
    ...overrides,
  }
}

describe('POST /api/reports/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakeRedisStore.clear()
    vi.mocked(redisClient.eval).mockResolvedValue(1)
  })

  it('renders a PDF for a workspace member on a PRO/AGENCY plan with published posts', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', name: 'Acme', plan: 'PRO' } as never)
    vi.mocked(prisma.post.findMany).mockResolvedValue([fakePost()] as never)

    const res = await POST(req({ workspaceId: 'ws-1', period: '7d' }))

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.toString()).toBe('PDF-BYTES')
    expect(generateNarrative).toHaveBeenCalledTimes(1)
    expect(renderReport).toHaveBeenCalledTimes(1)
  })

  it('returns 403 for a STARTER plan workspace', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', name: 'Acme', plan: 'STARTER' } as never)

    const res = await POST(req({ workspaceId: 'ws-1', period: '7d' }))
    expect(res.status).toBe(403)
    expect(prisma.post.findMany).not.toHaveBeenCalled()
  })

  it('returns 404 when the workspace is not found / caller lacks access', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue(null)

    const res = await POST(req({ workspaceId: 'ws-1', period: '7d' }))
    expect(res.status).toBe(404)
  })

  it('returns 422 with no published posts in the period', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', name: 'Acme', plan: 'PRO' } as never)
    vi.mocked(prisma.post.findMany).mockResolvedValue([] as never)

    const res = await POST(req({ workspaceId: 'ws-1', period: '7d' }))
    expect(res.status).toBe(422)
  })

  it('returns 400 for an invalid body', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    const res = await POST(req({ workspaceId: 'ws-1', period: 'bogus' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ workspaceId: 'ws-1', period: '7d' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when the rate limit is exceeded, before ever touching the workspace/report pipeline', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(redisClient.eval).mockResolvedValue(11) // over the limit of 10

    const res = await POST(req({ workspaceId: 'ws-1', period: '7d' }))
    expect(res.status).toBe(429)
    expect(prisma.workspace.findFirst).not.toHaveBeenCalled()
  })

  it('serves a cached PDF on the second call for the same workspace+period without regenerating the narrative or re-rendering', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', name: 'Acme', plan: 'PRO' } as never)
    vi.mocked(prisma.post.findMany).mockResolvedValue([fakePost()] as never)

    const res1 = await POST(req({ workspaceId: 'ws-1', period: '7d' }))
    expect(res1.status).toBe(200)
    expect(generateNarrative).toHaveBeenCalledTimes(1)
    expect(renderReport).toHaveBeenCalledTimes(1)

    const res2 = await POST(req({ workspaceId: 'ws-1', period: '7d' }))
    expect(res2.status).toBe(200)
    // Cache hit -- must not pay for another LLM call or PDF render.
    expect(generateNarrative).toHaveBeenCalledTimes(1)
    expect(renderReport).toHaveBeenCalledTimes(1)
    const buf2 = Buffer.from(await res2.arrayBuffer())
    expect(buf2.toString()).toBe('PDF-BYTES')
  })

  it('never serves workspace A cached report PDF to a request for workspace B (cross-workspace leak check)', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)

    vi.mocked(prisma.workspace.findFirst).mockResolvedValueOnce({ id: 'ws-A', name: 'Workspace A', plan: 'PRO' } as never)
    vi.mocked(prisma.post.findMany).mockResolvedValueOnce([fakePost()] as never)
    vi.mocked(renderReport).mockResolvedValueOnce(Buffer.from('WORKSPACE-A-PDF'))

    const resA = await POST(req({ workspaceId: 'ws-A', period: '7d' }))
    expect(resA.status).toBe(200)
    const bufA = Buffer.from(await resA.arrayBuffer())
    expect(bufA.toString()).toBe('WORKSPACE-A-PDF')

    // Different workspace, identical period -- must not receive workspace
    // A's cached PDF; must recompute for workspace B instead.
    vi.mocked(prisma.workspace.findFirst).mockResolvedValueOnce({ id: 'ws-B', name: 'Workspace B', plan: 'PRO' } as never)
    vi.mocked(prisma.post.findMany).mockResolvedValueOnce([fakePost()] as never)
    vi.mocked(renderReport).mockResolvedValueOnce(Buffer.from('WORKSPACE-B-PDF'))

    const resB = await POST(req({ workspaceId: 'ws-B', period: '7d' }))
    expect(resB.status).toBe(200)
    const bufB = Buffer.from(await resB.arrayBuffer())
    expect(bufB.toString()).toBe('WORKSPACE-B-PDF')
    expect(bufB.toString()).not.toBe(bufA.toString())
    expect(renderReport).toHaveBeenCalledTimes(2)

    // And workspace A's own second request still gets its cached PDF back.
    const resA2 = await POST(req({ workspaceId: 'ws-A', period: '7d' }))
    const bufA2 = Buffer.from(await resA2.arrayBuffer())
    expect(bufA2.toString()).toBe('WORKSPACE-A-PDF')
    expect(renderReport).toHaveBeenCalledTimes(2)
  })
})
