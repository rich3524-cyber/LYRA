import { describe, it, expect, vi, beforeEach } from 'vitest'

// The route reads APP_BASE_URL into a module-scope const, so it has to be set
// before the import below is evaluated -- vi.hoisted runs at hoist time, ahead
// of ESM imports, where a plain assignment in the file body would be too late.
vi.hoisted(() => {
  process.env.APP_BASE_URL = 'https://lyraonline.ai'
})

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    workspace:       { findFirst: vi.fn() },
    seoConnection:   { upsert: vi.fn() },
  },
}))
vi.mock('@/lib/encrypt', () => ({ encrypt: vi.fn((v: string) => `enc(${v})`) }))
vi.mock('@/lib/oauth-state', () => ({ verifyState: vi.fn() }))
vi.mock('@/services/seo/gsc-client', () => ({
  exchangeCode: vi.fn(),
  getSites:     vi.fn(),
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyState } from '@/lib/oauth-state'
import { exchangeCode, getSites } from '@/services/seo/gsc-client'
import { GET } from './route'

const req = () => new Request('http://localhost/api/seo/callback?code=auth-code&state=signed')

describe('GET /api/seo/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(verifyState).mockReturnValue({ workspaceId: 'ws-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
    vi.mocked(prisma.workspace.findFirst).mockResolvedValue({ websiteUrl: 'https://acme.com' } as never)
    vi.mocked(exchangeCode).mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' })
    vi.mocked(getSites).mockResolvedValue(['https://acme.com/'])
  })

  it('stores the connection for a writer, with both tokens encrypted', async () => {
    const res = await GET(req())

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://lyraonline.ai/workspace/ws-1/seo?connected=true')
    expect(prisma.seoConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:  { workspaceId: 'ws-1' },
      create: expect.objectContaining({ accessToken: 'enc(at)', refreshToken: 'enc(rt)' }),
      update: expect.objectContaining({ accessToken: 'enc(at)', refreshToken: 'enc(rt)' }),
    }))
  })

  // This callback is reachable by URL and GET /api/seo/connect is not
  // guaranteed to have run first, so the role check has to live here too --
  // without it a read-only client could repoint the workspace's Search Console
  // property and overwrite the stored Google refresh token for everyone else.
  it('refuses a read-only CLIENT_VIEW member and never exchanges the code', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as never)

    const res = await GET(req())

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://lyraonline.ai/?error=gsc_oauth_failed')
    expect(exchangeCode).not.toHaveBeenCalled()
    expect(prisma.seoConnection.upsert).not.toHaveBeenCalled()
  })

  it('refuses a user with no access to the workspace named in the state', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(null as never)

    const res = await GET(req())

    expect(res.headers.get('location')).toBe('https://lyraonline.ai/?error=gsc_oauth_failed')
    expect(exchangeCode).not.toHaveBeenCalled()
    expect(prisma.seoConnection.upsert).not.toHaveBeenCalled()
  })

  it('scopes the access lookup to the authenticated user', async () => {
    await GET(req())

    expect(prisma.workspaceAccess.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', userId: 'user-1' },
    })
  })

  it('rejects an unsigned or tampered state before any lookup', async () => {
    vi.mocked(verifyState).mockReturnValue(null as never)

    const res = await GET(req())

    expect(res.headers.get('location')).toBe('https://lyraonline.ai/?error=gsc_oauth_failed')
    expect(prisma.workspaceAccess.findFirst).not.toHaveBeenCalled()
    expect(exchangeCode).not.toHaveBeenCalled()
  })
})
