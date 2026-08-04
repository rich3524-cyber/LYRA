import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceAccess: { findFirst: vi.fn() },
    brandProfile: { findUnique: vi.fn() },
    guardrail: { findMany: vi.fn() },
  },
}))

import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from './route'

function req(workspaceId: string | null) {
  const url = workspaceId
    ? `http://localhost/api/brand-intelligence/profile?workspaceId=${workspaceId}`
    : 'http://localhost/api/brand-intelligence/profile'
  return new Request(url)
}

describe('GET /api/brand-intelligence/profile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns voice, tone, and guardrails for a workspace the user can access', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue({
      voiceSummary: 'Friendly, direct, no corporate jargon',
      toneAttributes: ['warm', 'confident'],
      contentThemes: ['local community', 'craftsmanship'],
    } as any)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([
      { type: 'NEVER_DISCUSS', value: 'pricing' },
      { type: 'APPROVED_ANSWER', value: 'We reply within 1 business day.' },
    ] as any)

    const res = await GET(req('ws-1'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body).toEqual({
      voiceSummary: 'Friendly, direct, no corporate jargon',
      toneAttributes: ['warm', 'confident'],
      contentThemes: ['local community', 'craftsmanship'],
      guardrails: [
        { type: 'NEVER_DISCUSS', value: 'pricing' },
        { type: 'APPROVED_ANSWER', value: 'We reply within 1 business day.' },
      ],
    })
    expect(prisma.brandProfile.findUnique).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      select: { voiceSummary: true, toneAttributes: true, contentThemes: true },
    })
    expect(prisma.guardrail.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      select: { type: true, value: true },
    })
  })

  it('returns nulls/empty defaults when no BrandProfile exists yet for the workspace', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue({ id: 'access-1' } as any)
    vi.mocked(prisma.brandProfile.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.guardrail.findMany).mockResolvedValue([])

    const res = await GET(req('ws-1'))
    const body = await res.json()
    expect(body).toEqual({
      voiceSummary: null,
      toneAttributes: [],
      contentThemes: [],
      guardrails: [],
    })
  })

  it('returns 400 when workspaceId is missing', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    const res = await GET(req(null))
    expect(res.status).toBe(400)
  })

  it('returns 403 when the user has no access to the workspace', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(prisma.workspaceAccess.findFirst).mockResolvedValue(null)
    const res = await GET(req('ws-1'))
    expect(res.status).toBe(403)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'))
    const res = await GET(req('ws-1'))
    expect(res.status).toBe(401)
  })
})
