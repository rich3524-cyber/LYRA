import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    emailIntegration: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DELETE } from './route'

function ctx(id = 'int-1') {
  return { params: Promise.resolve({ id }) }
}

const req = () => new Request('http://localhost/api/email-integrations/int-1', { method: 'DELETE' })

describe('DELETE /api/email-integrations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.emailIntegration.findFirst).mockResolvedValue({ id: 'int-1' } as never)
    vi.mocked(prisma.emailIntegration.update).mockResolvedValue({} as never)
  })

  // The point of this route's change: it used to set only isActive: false,
  // leaving the stored API key in the row forever -- and with no purge job
  // anywhere in the codebase, forever meant forever, after the user had as far
  // as the UI showed them removed the integration.
  it('clears the stored credential, not just the active flag', async () => {
    const res = await DELETE(req() as never, ctx())

    expect(res.status).toBe(200)
    expect(prisma.emailIntegration.update).toHaveBeenCalledWith({
      where: { id: 'int-1' },
      data: { isActive: false, apiKey: null },
    })
  })

  // Kept rather than deleted on purpose: EmailCampaign cascades from this row,
  // so a hard delete would discard every synced campaign with it.
  it('keeps the row so reconnecting preserves campaign history', async () => {
    await DELETE(req() as never, ctx())

    expect(prisma.emailIntegration.update).toHaveBeenCalledTimes(1)
    expect((prisma.emailIntegration as unknown as { delete?: unknown }).delete).toBeUndefined()
  })

  it('scopes the lookup to a workspace the caller can write to', async () => {
    await DELETE(req() as never, ctx())

    expect(prisma.emailIntegration.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'int-1',
        workspace: { access: { some: { userId: 'user-1', role: { not: 'CLIENT_VIEW' } } } },
      },
      select: { id: true },
    })
  })

  it('returns 403 and writes nothing when the integration exists but is another tenant\'s', async () => {
    vi.mocked(prisma.emailIntegration.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.emailIntegration.findUnique).mockResolvedValue({ id: 'int-1' } as never)

    const res = await DELETE(req() as never, ctx())

    expect(res.status).toBe(403)
    expect(prisma.emailIntegration.update).not.toHaveBeenCalled()
  })

  it('returns 404 and writes nothing when the integration does not exist', async () => {
    vi.mocked(prisma.emailIntegration.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.emailIntegration.findUnique).mockResolvedValue(null as never)

    const res = await DELETE(req() as never, ctx())

    expect(res.status).toBe(404)
    expect(prisma.emailIntegration.update).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))

    const res = await DELETE(req() as never, ctx())

    expect(res.status).toBe(401)
    expect(prisma.emailIntegration.update).not.toHaveBeenCalled()
  })
})
