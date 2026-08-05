import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    mcpAuditLog: { create: vi.fn() },
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/mcp/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/mcp/audit', () => {
  beforeEach(() => vi.clearAllMocks())

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

    expect(prisma.mcpAuditLog.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        userId: 'user-1',
        toolName: 'respond_to_item',
        params: undefined,
        outcome: 'ERROR',
        errorMessage: 'Refused by guardrail: NEVER_DISCUSS - pricing',
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
})
