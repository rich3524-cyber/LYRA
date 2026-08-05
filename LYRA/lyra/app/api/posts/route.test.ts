import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    socialAccount: { findMany: vi.fn() },
    post: { create: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/posts — approval-status resolution', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a SCHEDULED post as PENDING_APPROVAL when the workspace requires client approval', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      id: 'access-1', role: 'AGENCY_ADMIN', workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([{ id: 'sa-1', platform: 'FACEBOOK' }] as any)
    ;(prisma.post.create as any).mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data }))

    const res = await POST(req({
      workspaceId: 'ws-1', content: 'hello', platforms: ['FACEBOOK'],
      scheduledAt: '2026-09-01T00:00:00.000Z', status: 'SCHEDULED',
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body[0].status).toBe('PENDING_APPROVAL')
    // Echo-back added for the parent MCP spec's §6.2 wrong-workspace-write
    // mitigation -- every created post must include platform/account so a
    // workspace misresolution is visible immediately.
    expect(prisma.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { socialAccount: { select: { platform: true, name: true } } },
      })
    )
  })

  it('creates a SCHEDULED post as SCHEDULED when the workspace does not require client approval', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      id: 'access-1', role: 'AGENCY_ADMIN', workspace: { clientAccessLevel: 'NONE' },
    } as any)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([{ id: 'sa-1', platform: 'FACEBOOK' }] as any)
    ;(prisma.post.create as any).mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data }))

    const res = await POST(req({
      workspaceId: 'ws-1', content: 'hello', platforms: ['FACEBOOK'],
      scheduledAt: '2026-09-01T00:00:00.000Z', status: 'SCHEDULED',
    }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body[0].status).toBe('SCHEDULED')
  })

  it('does not apply approval-routing to a DRAFT post regardless of clientAccessLevel', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({
      id: 'access-1', role: 'AGENCY_ADMIN', workspace: { clientAccessLevel: 'APPROVE' },
    } as any)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([{ id: 'sa-1', platform: 'FACEBOOK' }] as any)
    ;(prisma.post.create as any).mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data }))

    const res = await POST(req({ workspaceId: 'ws-1', content: 'hello', platforms: ['FACEBOOK'], status: 'DRAFT' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body[0].status).toBe('DRAFT')
  })
})
