import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    post:            { findMany: vi.fn() },
    postMetrics:     { upsert: vi.fn() },
  },
}))
vi.mock('@/services/social/zernio-client', () => ({
  zernioClient: { getPostAnalytics: vi.fn() },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/analytics/sync', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

describe('POST /api/analytics/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('syncs for a workspace member with write access', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1', role: 'AGENCY_ADMIN' } as never)
    vi.mocked(prisma.post.findMany).mockResolvedValue([])

    const res = await POST(req({ workspaceId: 'ws-1' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ synced: 0, pending: 0, failed: 0, total: 0 })
  })

  it('rejects a read-only CLIENT_VIEW member -- this triggers a real external Zernio fan-out and DB writes, not read-only', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1', role: 'CLIENT_VIEW' } as never)

    const res = await POST(req({ workspaceId: 'ws-1' }))

    expect(res.status).toBe(403)
    expect(prisma.post.findMany).not.toHaveBeenCalled()
  })

  it('returns 403 with no membership at all', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(null)

    const res = await POST(req({ workspaceId: 'ws-1' }))
    expect(res.status).toBe(403)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ workspaceId: 'ws-1' }))
    expect(res.status).toBe(401)
  })
})
