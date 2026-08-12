// app/api/workspaces/[id]/bulk-import/parse/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    workspace: { findUnique: vi.fn() },
    socialAccount: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/xlsx-parser', () => ({ parseBulkImportFile: vi.fn() }))
vi.mock('@/services/posts/bulk-import', () => ({ validateImportRows: vi.fn() }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseBulkImportFile } from '@/lib/xlsx-parser'
import { validateImportRows } from '@/services/posts/bulk-import'
import { POST } from './route'

function ctx(id = 'ws-1') {
  return { params: Promise.resolve({ id }) }
}

function reqWithFile(bytes = new Uint8Array([1, 2, 3])) {
  const form = new FormData()
  form.set('file', new File([bytes], 'import.xlsx'))
  return new Request('http://localhost', { method: 'POST', body: form })
}

describe('POST /api/workspaces/[id]/bulk-import/parse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'AGENCY_ADMIN' } as never)
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ timezone: 'Australia/Sydney' } as never)
    vi.mocked(prisma.socialAccount.findMany).mockResolvedValue([
      { id: 'acc-fb', platform: 'FACEBOOK' },
    ] as never)
    vi.mocked(parseBulkImportFile).mockResolvedValue([])
    vi.mocked(validateImportRows).mockResolvedValue([])
  })

  it('returns 403 for a CLIENT_VIEW role, without parsing the file', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ role: 'CLIENT_VIEW' } as never)
    const res = await POST(reqWithFile(), ctx())
    expect(res.status).toBe(403)
    expect(parseBulkImportFile).not.toHaveBeenCalled()
  })

  it('returns 403 when the user has no access to the workspace', async () => {
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(null as never)
    const res = await POST(reqWithFile(), ctx())
    expect(res.status).toBe(403)
    expect(parseBulkImportFile).not.toHaveBeenCalled()
  })

  it('returns 400 when no file is attached', async () => {
    const res = await POST(new Request('http://localhost', { method: 'POST', body: new FormData() }), ctx())
    expect(res.status).toBe(400)
  })

  it('rejects an oversized upload before reading it into memory', async () => {
    // A 500-row spreadsheet is well under a megabyte; anything far past that
    // is not a real import and must not be buffered first.
    const huge = new Uint8Array(11 * 1024 * 1024)
    const res = await POST(reqWithFile(huge), ctx())
    expect(res.status).toBe(413)
    expect(parseBulkImportFile).not.toHaveBeenCalled()
  })

  it('rejects a file with more than 500 rows before validating any of them', async () => {
    vi.mocked(parseBulkImportFile).mockResolvedValue(
      Array.from({ length: 501 }, (_, i) => ({
        rowNumber: i + 4, date: '', time: '', platform: '', caption: '', mediaUrl: '',
      }))
    )
    const res = await POST(reqWithFile(), ctx())
    expect(res.status).toBe(422)
    expect(validateImportRows).not.toHaveBeenCalled()
  })

  it('returns 422 for a file with no data rows at all', async () => {
    vi.mocked(parseBulkImportFile).mockResolvedValue([])
    const res = await POST(reqWithFile(), ctx())
    expect(res.status).toBe(422)
  })

  it('returns 422 when the upload is not a readable spreadsheet', async () => {
    vi.mocked(parseBulkImportFile).mockRejectedValue(new Error('bad zip'))
    const res = await POST(reqWithFile(), ctx())
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/could not be read/i)
  })

  it('parses, validates against the workspace timezone and connected accounts, and returns the results', async () => {
    const raw = { rowNumber: 4, date: '2026-07-15', time: '09:00', platform: 'FACEBOOK', caption: 'Hi', mediaUrl: '' }
    vi.mocked(parseBulkImportFile).mockResolvedValue([raw])
    vi.mocked(validateImportRows).mockResolvedValue([{ rowNumber: 4, status: 'ready' }] as never)

    const res = await POST(reqWithFile(), ctx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ rows: [{ rowNumber: 4, status: 'ready' }] })
    expect(validateImportRows).toHaveBeenCalledWith([raw], [{ id: 'acc-fb', platform: 'FACEBOOK' }], 'Australia/Sydney')
  })

  it('falls back to UTC when the workspace has no timezone set', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(null as never)
    vi.mocked(parseBulkImportFile).mockResolvedValue([
      { rowNumber: 4, date: '2026-07-15', time: '09:00', platform: 'FACEBOOK', caption: 'Hi', mediaUrl: '' },
    ])

    await POST(reqWithFile(), ctx())

    expect(validateImportRows).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'UTC')
  })

  it('reads connected accounts in a stable order', async () => {
    // validateImportRow takes the first account matching a platform, so an
    // unordered query would make which Page a row targets non-deterministic.
    vi.mocked(parseBulkImportFile).mockResolvedValue([
      { rowNumber: 4, date: '2026-07-15', time: '09:00', platform: 'FACEBOOK', caption: 'Hi', mediaUrl: '' },
    ])

    await POST(reqWithFile(), ctx())

    expect(prisma.socialAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where:   { workspaceId: 'ws-1', isActive: true },
        orderBy: { createdAt: 'asc' },
      })
    )
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(reqWithFile(), ctx())
    expect(res.status).toBe(401)
  })
})
