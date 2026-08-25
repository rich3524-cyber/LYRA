import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PATCH } from './route'

function req(body: unknown) {
  return new Request('http://localhost/api/workspaces/ws-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/workspaces/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'PRO' } as any)
    ;(prisma.workspace.update as any).mockImplementation(async ({ data }: any) => ({ id: 'ws-1', ...data }))
  })

  it('updates a workspace for a well-formed body', async () => {
    const res = await PATCH(req({ name: 'New Name', clientAccessLevel: 'APPROVE', timezone: 'Australia/Sydney' }), ctx('ws-1'))
    expect(res.status).toBe(200)
    expect(prisma.workspace.update).toHaveBeenCalledWith({
      where: { id: 'ws-1' },
      data: { name: 'New Name', clientAccessLevel: 'APPROVE', timezone: 'Australia/Sydney' },
    })
  })

  it('returns 404 when the requesting user is not an owner-role member', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue(null)
    const res = await PATCH(req({ name: 'New Name' }), ctx('ws-1'))
    expect(res.status).toBe(404)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('returns 403 when enabling crisisAware on a STARTER plan', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'STARTER' } as any)
    const res = await PATCH(req({ crisisAware: true }), ctx('ws-1'))
    expect(res.status).toBe(403)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('returns 400 with the existing field-specific message when approvalSlaHours is out of bounds', async () => {
    const res = await PATCH(req({ approvalSlaHours: 1000 }), ctx('ws-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('approvalSlaHours must be a whole number of hours between 1 and 720.')
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('returns 400 with the existing field-specific message when approvalSlaHours is not a whole number', async () => {
    const res = await PATCH(req({ approvalSlaHours: 4.5 }), ctx('ws-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('approvalSlaHours must be a whole number of hours between 1 and 720.')
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await PATCH(req({ name: 'New Name' }), ctx('ws-1'))
    expect(res.status).toBe(401)
  })

  // Regression: an invalid clientAccessLevel previously reached
  // prisma.workspace.update() unvalidated, throwing a Prisma-level
  // enum-violation error (a 500). clientAccessLevel gates real
  // authorization (what CLIENT_VIEW/CLIENT_APPROVE users can do), so it must
  // 400 cleanly instead.
  it('returns 400 (not 500) for an invalid clientAccessLevel', async () => {
    const res = await PATCH(req({ clientAccessLevel: 'SUPERADMIN' }), ctx('ws-1'))
    expect(res.status).toBe(400)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  // Regression: name being a non-string previously reached `name.trim()`
  // unguarded and threw a TypeError, falling through to the generic 500
  // handler.
  it('returns 400 (not 500) when name is not a string', async () => {
    const res = await PATCH(req({ name: 12345 }), ctx('ws-1'))
    expect(res.status).toBe(400)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('returns 400 (not 500) for a body that is not valid JSON', async () => {
    const badReq = new Request('http://localhost/api/workspaces/ws-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    })
    const res = await PATCH(badReq, ctx('ws-1'))
    expect(res.status).toBe(400)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('returns 403 when enabling Draft + Approve on a STARTER plan', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'STARTER' } as any)
    const res = await PATCH(req({ aiResponseMode: 'DRAFT_APPROVE' }), ctx('ws-1'))
    expect(res.status).toBe(403)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('still returns 403 when enabling Full Automatic on a STARTER plan (regression)', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'STARTER' } as any)
    const res = await PATCH(req({ aiResponseMode: 'FULL' }), ctx('ws-1'))
    expect(res.status).toBe(403)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('allows Draft + Approve on a PRO plan', async () => {
    const res = await PATCH(req({ aiResponseMode: 'DRAFT_APPROVE' }), ctx('ws-1'))
    expect(res.status).toBe(200)
    expect(prisma.workspace.update).toHaveBeenCalledWith({
      where: { id: 'ws-1' },
      data: { aiResponseMode: 'DRAFT_APPROVE' },
    })
  })

  it('allows Draft + Approve on an AGENCY plan', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'AGENCY' } as any)
    const res = await PATCH(req({ aiResponseMode: 'DRAFT_APPROVE' }), ctx('ws-1'))
    expect(res.status).toBe(200)
  })

  it('still allows OFF on a STARTER plan (regression)', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', plan: 'STARTER' } as any)
    const res = await PATCH(req({ aiResponseMode: 'OFF' }), ctx('ws-1'))
    expect(res.status).toBe(200)
  })
})
