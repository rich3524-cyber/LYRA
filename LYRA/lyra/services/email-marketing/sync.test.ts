import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    emailIntegration: { findUnique: vi.fn(), update: vi.fn() },
    emailCampaign:    { upsert: vi.fn() },
  },
}))
vi.mock('@/lib/encrypt', () => ({ decrypt: vi.fn() }))
vi.mock('./klaviyo-campaigns', () => ({ fetchKlaviyoCampaigns: vi.fn() }))
vi.mock('./mailchimp-campaigns', () => ({ fetchMailchimpCampaigns: vi.fn() }))
vi.mock('./customerio-campaigns', () => ({ fetchCustomerioCampaigns: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { fetchKlaviyoCampaigns } from './klaviyo-campaigns'
import { syncEmailIntegration } from './sync'

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'int-1',
    provider: 'KLAVIYO',
    apiKey: 'ciphertext',
    serverPrefix: null,
    isActive: true,
    ...overrides,
  }
}

describe('syncEmailIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.emailIntegration.findUnique).mockResolvedValue(integration() as never)
    vi.mocked(decrypt).mockReturnValue('pk_live_realkey')
    vi.mocked(fetchKlaviyoCampaigns).mockResolvedValue([])
    vi.mocked(prisma.emailIntegration.update).mockResolvedValue({} as never)
  })

  it('decrypts the stored credential and passes the plaintext to the provider', async () => {
    await syncEmailIntegration('int-1')

    expect(decrypt).toHaveBeenCalledWith('ciphertext')
    expect(fetchKlaviyoCampaigns).toHaveBeenCalledWith('pk_live_realkey')
  })

  // The lazy self-healing re-encrypt that used to live here is deliberately
  // gone. It fired only on sync, so a row that never synced stayed plaintext
  // indefinitely -- which is exactly how both production keys were still
  // readable months after this field was encrypted, while both were active.
  // Masking a plaintext credential as a warning let it persist unnoticed.
  it('throws instead of re-encrypting when the stored value cannot be decrypted', async () => {
    vi.mocked(decrypt).mockImplementation(() => { throw new Error('bad tag') })

    await expect(syncEmailIntegration('int-1')).rejects.toThrow(/cannot decrypt/)

    expect(prisma.emailIntegration.update).not.toHaveBeenCalled()
    expect(fetchKlaviyoCampaigns).not.toHaveBeenCalled()
  })

  it('never calls the provider with a value it failed to decrypt', async () => {
    vi.mocked(decrypt).mockImplementation(() => { throw new Error('bad tag') })

    await expect(syncEmailIntegration('int-1')).rejects.toThrow()

    expect(fetchKlaviyoCampaigns).not.toHaveBeenCalled()
    expect(prisma.emailCampaign.upsert).not.toHaveBeenCalled()
  })

  // apiKey is null once disconnected -- the credential is deleted, not kept.
  it('skips quietly when the credential has been removed', async () => {
    vi.mocked(prisma.emailIntegration.findUnique).mockResolvedValue(
      integration({ apiKey: null }) as never
    )

    await expect(syncEmailIntegration('int-1')).resolves.toEqual({ synced: 0 })

    expect(decrypt).not.toHaveBeenCalled()
    expect(fetchKlaviyoCampaigns).not.toHaveBeenCalled()
  })

  it('skips an inactive integration without touching its credential', async () => {
    vi.mocked(prisma.emailIntegration.findUnique).mockResolvedValue(
      integration({ isActive: false }) as never
    )

    await expect(syncEmailIntegration('int-1')).resolves.toEqual({ synced: 0 })

    expect(decrypt).not.toHaveBeenCalled()
  })

  it('returns zero for an integration that does not exist', async () => {
    vi.mocked(prisma.emailIntegration.findUnique).mockResolvedValue(null as never)

    await expect(syncEmailIntegration('nope')).resolves.toEqual({ synced: 0 })
  })
})
