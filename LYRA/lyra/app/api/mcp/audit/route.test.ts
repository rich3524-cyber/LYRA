import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    mcpAuditLog: { create: vi.fn() },
  },
}))
// Only checkRateLimit talks to Redis -- keep the real rateLimitResponse so
// its status/body shape stays in sync with the other routes that use it.
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>()
  return { ...actual, checkRateLimit: vi.fn() }
})

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/mcp/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/mcp/audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 119 })
  })

  it('writes an audit row for a request the caller has access to', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as any)
    vi.mocked(prisma.mcpAuditLog.create).mockResolvedValue({} as any)

    const res = await POST(req({
      workspaceId: 'ws-1',
      toolName: 'schedule_post',
      params: { workspace_id: 'ws-1', content: 'hello' },
      outcome: 'SUCCESS',
    }))

    expect(res.status).toBe(201)
    expect(prisma.mcpAuditLog.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        userId: 'user-1',
        toolName: 'schedule_post',
        params: { workspace_id: 'ws-1', content: 'hello' },
        outcome: 'SUCCESS',
        errorMessage: null,
      },
    })
  })

  it('writes an ERROR row with the error message when provided', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as any)
    vi.mocked(prisma.mcpAuditLog.create).mockResolvedValue({} as any)

    await POST(req({
      workspaceId: 'ws-1',
      toolName: 'respond_to_item',
      outcome: 'ERROR',
      errorMessage: 'Refused by guardrail: NEVER_DISCUSS - pricing',
    }))

    // params was omitted from the request body, so it comes through the
    // schema as undefined -- the route normalizes that (and explicit null)
    // to Prisma.DbNull so the write can't throw at runtime (see the
    // "params: null" test below for why undefined can't be passed through
    // as-is).
    expect(prisma.mcpAuditLog.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        userId: 'user-1',
        toolName: 'respond_to_item',
        params: Prisma.DbNull,
        outcome: 'ERROR',
        errorMessage: 'Refused by guardrail: NEVER_DISCUSS - pricing',
      },
    })
  })

  it('writes a row with params: Prisma.DbNull when the request body has params: null', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as any)
    vi.mocked(prisma.mcpAuditLog.create).mockResolvedValue({} as any)

    const res = await POST(req({
      workspaceId: 'ws-1',
      toolName: 'x',
      outcome: 'SUCCESS',
      params: null,
    }))

    expect(res.status).toBe(201)
    expect(prisma.mcpAuditLog.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        userId: 'user-1',
        toolName: 'x',
        params: Prisma.DbNull,
        outcome: 'SUCCESS',
        errorMessage: null,
      },
    })
  })

  it('returns 403 when the caller has no access to the given workspace', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(null)

    const res = await POST(req({ workspaceId: 'ws-1', toolName: 'x', outcome: 'SUCCESS' }))
    expect(res.status).toBe(403)
    expect(prisma.mcpAuditLog.create).not.toHaveBeenCalled()
  })

  it('returns 400 on an invalid outcome value', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    const res = await POST(req({ workspaceId: 'ws-1', toolName: 'x', outcome: 'MAYBE' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(req({ workspaceId: 'ws-1', toolName: 'x', outcome: 'SUCCESS' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when errorMessage exceeds the 2000 character cap', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    const res = await POST(req({
      workspaceId: 'ws-1',
      toolName: 'x',
      outcome: 'ERROR',
      errorMessage: 'a'.repeat(2001),
    }))
    expect(res.status).toBe(400)
    expect(prisma.mcpAuditLog.create).not.toHaveBeenCalled()
  })

  it('returns 400 when the serialized params size exceeds the cap', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as any)

    const res = await POST(req({
      workspaceId: 'ws-1',
      toolName: 'x',
      outcome: 'SUCCESS',
      params: { content: 'a'.repeat(50_001) },
    }))

    expect(res.status).toBe(400)
    expect(prisma.mcpAuditLog.create).not.toHaveBeenCalled()
  })

  it('returns 429 and does not write when the per-user rate limit is exceeded', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0 })

    const res = await POST(req({ workspaceId: 'ws-1', toolName: 'x', outcome: 'SUCCESS' }))

    expect(res.status).toBe(429)
    expect(prisma.mcpAuditLog.create).not.toHaveBeenCalled()
  })
})
