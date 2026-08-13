import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { workspace: { findFirst: vi.fn() } },
}))
vi.mock('@/services/social/zernio-connect', () => ({ ensureZernioProfile: vi.fn() }))
vi.mock('@/services/social/provider/platform-map', () => ({ toZernioPlatform: vi.fn(() => 'facebook') }))
vi.mock('@/services/social/zernio-client', () => ({
  zernioClient: { getConnectUrl: vi.fn() },
  ZernioApiError: class ZernioApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureZernioProfile } from '@/services/social/zernio-connect'
import { zernioClient } from '@/services/social/zernio-client'
import { GET } from './route'

function ctx(platform = 'facebook') {
  return { params: Promise.resolve({ platform }) }
}

function req(workspaceId: string | null) {
  const url = workspaceId
    ? `http://localhost/api/social/connect/facebook?workspaceId=${workspaceId}`
    : 'http://localhost/api/social/connect/facebook'
  return new Request(url)
}

describe('GET /api/social/connect/[platform]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.APP_BASE_URL = 'https://lyraonline.ai'
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ id: 'ws-1', name: 'Acme' } as never)
    vi.mocked(ensureZernioProfile).mockResolvedValue('profile-1')
    vi.mocked(zernioClient.getConnectUrl).mockResolvedValue({ authUrl: 'https://zernio.example/auth' } as never)
  })

  it('starts the connect flow for a workspace member with write access', async () => {
    const res = await GET(req('ws-1'), ctx())
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://zernio.example/auth')
  })

  // Regression: this route kicks off a real OAuth connect flow that attaches
  // a new social account to the workspace -- a write, not a read. The access
  // check previously admitted any membership row, including CLIENT_VIEW.
  it('excludes CLIENT_VIEW from starting a connect flow', async () => {
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue(null as never)

    const res = await GET(req('ws-1'), ctx())

    expect(res.status).toBe(403)
    expect(prisma.workspace.findFirst).toHaveBeenCalledWith({
      where: { id: 'ws-1', access: { some: { userId: 'user-1', role: { not: 'CLIENT_VIEW' } } } },
    })
    expect(ensureZernioProfile).not.toHaveBeenCalled()
  })

  it('returns 400 when workspaceId is missing', async () => {
    const res = await GET(req(null), ctx())
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await GET(req('ws-1'), ctx())
    expect(res.status).toBe(401)
  })
})
