// services/notifications/crisis-alert-email.test.ts
import { describe, it, expect } from 'vitest'
import { buildCrisisAlertEmail } from './crisis-alert-email'

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
