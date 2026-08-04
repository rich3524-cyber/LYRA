import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { workspace: { findMany: vi.fn() } } }))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from './route'

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
