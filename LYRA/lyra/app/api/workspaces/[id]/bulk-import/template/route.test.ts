// app/api/workspaces/[id]/bulk-import/template/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    socialAccount: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/xlsx-template', () => ({ buildBulkImportTemplate: vi.fn() }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildBulkImportTemplate } from '@/lib/xlsx-template'
import { GET } from './route'

function ctx(id = 'ws-1') {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/workspaces/[id]/bulk-import/template', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(buildBulkImportTemplate).mockResolvedValue(Buffer.from('fake-xlsx'))
  })

  it('returns 403 for a CLIENT_VIEW role', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as never)

    const res = await GET(new Request('http://localhost'), ctx())
    expect(res.status).toBe(403)
    expect(buildBulkImportTemplate).not.toHaveBeenCalled()
  })

  it('returns 403 when the user has no access to the workspace at all', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(null as never)

    const res = await GET(new Request('http://localhost'), ctx())
    expect(res.status).toBe(403)
    expect(buildBulkImportTemplate).not.toHaveBeenCalled()
  })

  it('streams the xlsx with the correct headers, built from deduped connected platforms', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([
      { platform: 'FACEBOOK' },
      { platform: 'FACEBOOK' },
      { platform: 'INSTAGRAM' },
    ] as never)

    const res = await GET(new Request('http://localhost'), ctx())

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
    // Two Facebook accounts must not produce a duplicated dropdown entry.
    expect(buildBulkImportTemplate).toHaveBeenCalledWith(['FACEBOOK', 'INSTAGRAM'])
  })

  it('only offers platforms from active accounts', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([{ platform: 'FACEBOOK' }] as never)

    await GET(new Request('http://localhost'), ctx())

    expect(prisma.socialAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'ws-1', isActive: true } })
    )
  })

  it('still returns a template when nothing is connected', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([] as never)

    const res = await GET(new Request('http://localhost'), ctx())

    expect(res.status).toBe(200)
    expect(buildBulkImportTemplate).toHaveBeenCalledWith([])
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))

    const res = await GET(new Request('http://localhost'), ctx())
    expect(res.status).toBe(401)
  })
})
