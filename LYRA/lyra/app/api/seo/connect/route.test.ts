import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { workspaceAccess: { findFirst: vi.fn() } },
}))
vi.mock('@/services/seo/gsc-client', () => ({
  getAuthUrl: vi.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?state=signed'),
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAuthUrl } from '@/services/seo/gsc-client'
import { GET } from './route'

const req = (qs = '?workspaceId=ws-1') => new Request(`http://localhost/api/seo/connect${qs}`)

describe('GET /api/seo/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
  })

  it('redirects a writer to the Google consent screen', async () => {
    const res = await GET(req())

    expect(res.status).toBe(307)
    expect(getAuthUrl).toHaveBeenCalledWith('ws-1')
  })

  // The whole point of the check: workspaceId is attacker-chosen query input
  // that gets signed into the OAuth state the callback trusts as its upsert
  // target, so a non-member must not even reach Google.
  it('returns 403 without signing state when the user has no access to the workspace', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(null as never)

    const res = await GET(req())

    expect(res.status).toBe(403)
    expect(getAuthUrl).not.toHaveBeenCalled()
  })

  it('returns 403 for a read-only CLIENT_VIEW member', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as never)

    const res = await GET(req())

    expect(res.status).toBe(403)
    expect(getAuthUrl).not.toHaveBeenCalled()
  })

  it('scopes the access lookup to the authenticated user, not just the workspace', async () => {
    await GET(req())

    expect(prisma.workspaceAccess.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', userId: 'user-1' },
    })
  })

  it('returns 400 when workspaceId is absent', async () => {
    const res = await GET(req(''))

    expect(res.status).toBe(400)
    expect(prisma.workspaceAccess.findFirst).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))

    const res = await GET(req())

    expect(res.status).toBe(401)
    expect(getAuthUrl).not.toHaveBeenCalled()
  })
})
