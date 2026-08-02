// services/notifications/crisis-alert-email.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    workspaceAccess: { findMany: vi.fn() },
    comment: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/resend', () => ({
  resend: { emails: { send: vi.fn() } },
  EMAIL_FROM: 'notifications@lyraonline.ai',
}))

import { buildCrisisAlertEmail, sendCrisisAlertEmail } from './crisis-alert-email'
import { prisma } from '@/lib/prisma'
import { resend } from '@/lib/resend'

const BASE_PARAMS = {
  workspaceName: 'Into The Wild Marketing',
  workspaceId: 'ws_123',
  triggerType: 'KEYWORD_MATCH' as const,
  comment: {
    content: 'Considering a lawsuit over how this was handled.',
    authorName: 'Jane Doe',
    platform: 'FACEBOOK',
  },
  appBaseUrl: 'https://lyraonline.ai',
}

describe('buildCrisisAlertEmail', () => {
  it('includes the workspace name in the subject', () => {
    const { subject } = buildCrisisAlertEmail(BASE_PARAMS)
    expect(subject).toBe('Crisis Aware alert — Into The Wild Marketing')
  })

  it('describes a keyword match trigger in plain language', () => {
    const { html } = buildCrisisAlertEmail(BASE_PARAMS)
    expect(html).toContain('matched an escalation keyword')
  })

  it('describes a sentiment spike trigger in plain language', () => {
    const { html } = buildCrisisAlertEmail({ ...BASE_PARAMS, triggerType: 'SENTIMENT_SPIKE' })
    expect(html).toContain('negative comments')
  })

  it('includes the comment excerpt, author, and platform', () => {
    const { html } = buildCrisisAlertEmail(BASE_PARAMS)
    expect(html).toContain('Considering a lawsuit over how this was handled.')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('Facebook')
  })

  it('truncates a long comment to roughly 150 characters', () => {
    const longContent = 'x'.repeat(300)
    const { html } = buildCrisisAlertEmail({
      ...BASE_PARAMS,
      comment: { ...BASE_PARAMS.comment, content: longContent },
    })
    expect(html).toContain('x'.repeat(150))
    expect(html).not.toContain('x'.repeat(151))
  })

  it('HTML-escapes comment content to prevent injection', () => {
    const { html } = buildCrisisAlertEmail({
      ...BASE_PARAMS,
      comment: { ...BASE_PARAMS.comment, content: '<script>alert(1)</script>' },
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('includes a link to the workspace inbox using the given base URL', () => {
    const { html } = buildCrisisAlertEmail(BASE_PARAMS)
    expect(html).toContain('https://lyraonline.ai/workspace/ws_123/inbox')
  })

  it('builds without a comment excerpt when none is available', () => {
    const { html } = buildCrisisAlertEmail({ ...BASE_PARAMS, comment: null })
    expect(html).toContain('https://lyraonline.ai/workspace/ws_123/inbox')
    expect(html).not.toContain('undefined')
  })
})

describe('sendCrisisAlertEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.APP_BASE_URL = 'https://lyraonline.ai'
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ name: 'Into The Wild Marketing' } as never)
    vi.mocked(prisma.comment.findUnique).mockResolvedValue(null)
  })

  it('still attempts every owner/admin recipient even when one send rejects', async () => {
    vi.mocked(prisma.workspaceAccess.findMany).mockResolvedValue([
      { user: { email: 'owner1@example.com' } },
      { user: { email: 'owner2@example.com' } },
    ] as never)

    vi.mocked(resend.emails.send).mockImplementation((params) => {
      const to = (params as { to: string }).to
      if (to === 'owner2@example.com') {
        return Promise.reject(new Error('network error'))
      }
      return Promise.resolve({ data: { id: 'email_1' }, error: null } as never)
    })

    await sendCrisisAlertEmail('ws_123', 'KEYWORD_MATCH', [])

    expect(resend.emails.send).toHaveBeenCalledTimes(2)
    expect(resend.emails.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner1@example.com' }))
    expect(resend.emails.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner2@example.com' }))
  })

  it('never throws even when every send rejects (fail-open)', async () => {
    vi.mocked(prisma.workspaceAccess.findMany).mockResolvedValue([
      { user: { email: 'owner1@example.com' } },
    ] as never)
    vi.mocked(resend.emails.send).mockRejectedValue(new Error('network error'))

    await expect(sendCrisisAlertEmail('ws_123', 'KEYWORD_MATCH', [])).resolves.toBeUndefined()
  })
})
