import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    agency:    { findUnique: vi.fn() },
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET, POST } from './route'

function postReq(body: unknown) {
  return new Request('http://localhost/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/workspaces', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns workspaces shaped with role and platforms flattened to top level', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspace.findMany).mockResolvedValue([
      {
        id: 'ws-1',
        name: 'Into The Wild Marketing',
        industry: 'Professional Services',
        clientAccessLevel: 'APPROVE',
        aiResponseMode: 'DRAFT_APPROVE',
        plan: 'AGENCY',
        access: [{ role: 'AGENCY_ADMIN' }],
        socialAccounts: [{ platform: 'FACEBOOK' }, { platform: 'INSTAGRAM' }],
      },
    ] as any)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body).toEqual([
      {
        id: 'ws-1',
        name: 'Into The Wild Marketing',
        industry: 'Professional Services',
        clientAccessLevel: 'APPROVE',
        aiResponseMode: 'DRAFT_APPROVE',
        plan: 'AGENCY',
        role: 'AGENCY_ADMIN',
        platforms: ['FACEBOOK', 'INSTAGRAM'],
      },
    ])

    expect(prisma.workspace.findMany).toHaveBeenCalledWith({
      where: { access: { some: { userId: 'user-1' } } },
      select: {
        id: true,
        name: true,
        industry: true,
        clientAccessLevel: true,
        aiResponseMode: true,
        plan: true,
        access: { where: { userId: 'user-1' }, select: { role: true } },
        socialAccounts: { where: { isActive: true }, select: { platform: true } },
      },
      orderBy: { name: 'asc' },
    })
  })

  it('returns role: null when the access array is empty (defensive — should not happen in practice)', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspace.findMany).mockResolvedValue([
      {
        id: 'ws-1', name: 'X', industry: null, clientAccessLevel: 'APPROVE',
        aiResponseMode: 'OFF', plan: 'STARTER', access: [], socialAccounts: [],
      },
    ] as any)

    const res = await GET()
    const body = await res.json()
    expect(body[0].role).toBeNull()
    expect(body[0].platforms).toEqual([])
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('POST /api/workspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1', agencyId: null } as any)
    ;(prisma.workspace.create as any).mockImplementation(async ({ data }: any) => ({ id: 'ws-new', ...data }))
  })

  it('creates a workspace for a well-formed body', async () => {
    const res = await POST(postReq({ name: 'Acme Co', industry: 'Retail', clientAccessLevel: 'VIEW' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Acme Co')
    expect(prisma.workspace.create).toHaveBeenCalledWith({
      data: {
        name:              'Acme Co',
        industry:          'Retail',
        websiteUrl:        undefined,
        agencyId:          undefined,
        plan:              undefined,
        clientAccessLevel: 'VIEW',
        access: { create: { userId: 'user-1', role: 'AGENCY_ADMIN' } },
      },
    })
  })

  it('defaults clientAccessLevel to NONE when omitted', async () => {
    const res = await POST(postReq({ name: 'Acme Co' }))
    expect(res.status).toBe(201)
    expect(prisma.workspace.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientAccessLevel: 'NONE' }) })
    )
  })

  it('returns 400 when name is empty/whitespace-only', async () => {
    const res = await POST(postReq({ name: '   ' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Name required')
    expect(prisma.workspace.create).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await POST(postReq({ name: 'Acme Co' }))
    expect(res.status).toBe(401)
  })

  // Regression: name being a non-string (e.g. a number) previously reached
  // `name.trim()` unguarded and threw a TypeError, falling through to the
  // generic 500 handler. It now 400s before that call.
  it('returns 400 (not 500) when name is not a string', async () => {
    const res = await POST(postReq({ name: 12345 }))
    expect(res.status).toBe(400)
    expect(prisma.workspace.create).not.toHaveBeenCalled()
  })

  // Regression: an invalid clientAccessLevel previously reached
  // prisma.workspace.create() unvalidated, which would throw a Prisma-level
  // enum-violation error (a 500) instead of a clean 400. clientAccessLevel
  // gates what CLIENT_VIEW/CLIENT_APPROVE users can see and do, so an
  // unrecognised value must be rejected outright, not silently coerced.
  it('returns 400 (not 500) for an invalid clientAccessLevel', async () => {
    const res = await POST(postReq({ name: 'Acme Co', clientAccessLevel: 'SUPERADMIN' }))
    expect(res.status).toBe(400)
    expect(prisma.workspace.create).not.toHaveBeenCalled()
  })

  it('returns 400 (not 500) for a body that is not valid JSON', async () => {
    const badReq = new Request('http://localhost/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    })
    const res = await POST(badReq)
    expect(res.status).toBe(400)
    expect(prisma.workspace.create).not.toHaveBeenCalled()
  })

  it('enforces the agency plan workspace limit', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1', agencyId: 'agency-1' } as any)
    vi.mocked(prisma.agency.findUnique).mockResolvedValue({ plan: 'STARTER' } as any)
    vi.mocked(prisma.workspace.count).mockResolvedValue(1)

    const res = await POST(postReq({ name: 'Second Workspace' }))
    expect(res.status).toBe(403)
    expect(prisma.workspace.create).not.toHaveBeenCalled()
  })
})
