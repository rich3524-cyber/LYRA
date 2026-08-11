// services/notifications/slack-formatter.test.ts
import { describe, it, expect } from 'vitest'
import { buildMessage, truncate } from './message'
import { escapeSlack, formatSlackText, formatSlackMessage } from './slack-formatter'

const OPTS = { workspaceId: 'ws_123', appBaseUrl: 'https://lyraonline.ai', timeZone: 'Australia/Sydney' }

describe('escapeSlack', () => {
  it('escapes the three characters Slack requires', () => {
    expect(escapeSlack('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
  })

  it('escapes ampersands before angle brackets, not after', () => {
    // Naively replacing < then & would double-escape into &amp;lt;
    expect(escapeSlack('<')).toBe('&lt;')
  })

  it('leaves quotes and apostrophes alone', () => {
    // Slack does not decode HTML entities beyond the three above -- escaping
    // these would render a literal &#39; in the channel.
    expect(escapeSlack(`it's "fine"`)).toBe(`it's "fine"`)
  })
})

describe('formatSlackText — link injection', () => {
  it('neutralises mrkdwn link syntax smuggled inside untrusted content', () => {
    const msg = buildMessage(
      {
        event:         'CRISIS_DETECTED',
        workspaceName: 'Acme',
        triggerType:   'KEYWORD_MATCH',
        comment:       {
          content:    '<https://evil.example|Click here to resolve>',
          authorName: 'Attacker',
          platform:   'FACEBOOK',
        },
      },
      OPTS
    )
    const text = formatSlackText(msg)

    // The only real link in the message is LYRA's own.
    const links = text.match(/<[^>]*\|[^>]*>/g) ?? []
    expect(links).toHaveLength(1)
    expect(links[0]).toContain('lyraonline.ai')
    expect(text).toContain('&lt;https://evil.example|Click here to resolve&gt;')
  })

  it('strips link-breaking characters from the deep-link URL itself', () => {
    const text = formatSlackText({
      title:     'T',
      summary:   'S',
      linkUrl:   'https://lyraonline.ai/x?a=1|b>c',
      linkLabel: 'Open',
    })
    expect(text).toContain('<https://lyraonline.ai/x?a=1bc|Open>')
  })
})

describe('formatSlackText — structure', () => {
  it('bolds the title and renders the deep link last', () => {
    const text = formatSlackText({
      title:     'Crisis detected — Acme',
      summary:   'A comment matched an escalation keyword.',
      linkUrl:   'https://lyraonline.ai/workspace/ws_123/inbox',
      linkLabel: 'Review in Inbox',
    })
    const lines = text.split('\n')
    expect(lines[0]).toBe('*Crisis detected — Acme*')
    expect(lines[lines.length - 1]).toBe('<https://lyraonline.ai/workspace/ws_123/inbox|Review in Inbox>')
  })

  it('prefixes every line of a multi-line quote so the block stays intact', () => {
    const text = formatSlackText({
      title:     'T',
      summary:   'S',
      quote:     { text: 'line one\nline two', attribution: 'Jane · FACEBOOK' },
      linkUrl:   'https://lyraonline.ai',
      linkLabel: 'Open',
    })
    expect(text).toContain('> line one\n> line two')
    expect(text).toContain('> — Jane · FACEBOOK')
  })

  it('renders facts as bold-label rows', () => {
    const text = formatSlackText({
      title:     'T',
      summary:   'S',
      facts:     [{ label: 'Waiting', value: '6 hours' }],
      linkUrl:   'https://lyraonline.ai',
      linkLabel: 'Open',
    })
    expect(text).toContain('*Waiting:* 6 hours')
  })

  it('contains no emoji, per the brand voice rules', () => {
    const msg = buildMessage(
      { event: 'CRISIS_DETECTED', workspaceName: 'Acme', triggerType: 'SENTIMENT_SPIKE', comment: null },
      OPTS
    )
    expect(formatSlackText(msg)).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})

describe('truncate', () => {
  it('leaves short text untouched', () => {
    expect(truncate('short', 10)).toBe('short')
  })

  it('appends an ellipsis when it cuts', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde…')
  })

  it('does not split a surrogate pair in half', () => {
    // Four astral-plane characters; cutting at 2 must yield 2 whole ones.
    const result = truncate('👍👍👍👍', 2)
    expect(result).toBe('👍👍…')
    expect(result).not.toContain('�')
  })
})

describe('buildMessage', () => {
  it('reports paused publishing on a crisis', () => {
    const msg = buildMessage(
      { event: 'CRISIS_DETECTED', workspaceName: 'Acme', triggerType: 'KEYWORD_MATCH', comment: null },
      OPTS
    )
    expect(msg.title).toBe('Crisis detected — Acme')
    expect(msg.summary).toContain('paused')
    expect(msg.linkUrl).toBe('https://lyraonline.ai/workspace/ws_123/inbox')
  })

  it('links to the Inbox, quotes the comment, and omits the Reason fact when none is given', () => {
    const msg = buildMessage(
      {
        event:         'COMMENT_ESCALATED',
        workspaceName: 'Acme',
        platform:      'Instagram',
        excerpt:       'This is unacceptable.',
        authorName:    'Jane',
      },
      OPTS
    )
    expect(msg.title).toBe('Comment escalated — Acme')
    expect(msg.summary).toContain('Instagram')
    expect(msg.quote).toEqual({ text: 'This is unacceptable.', attribution: 'Jane' })
    expect(msg.facts).toBeUndefined()
    expect(msg.linkUrl).toBe('https://lyraonline.ai/workspace/ws_123/inbox')
    expect(msg.linkLabel).toBe('Review in Inbox')
  })

  it('renders the escalation reason as a fact when one is given', () => {
    const msg = buildMessage(
      {
        event:            'COMMENT_ESCALATED',
        workspaceName:    'Acme',
        platform:         'FACEBOOK',
        excerpt:          'A pointed question',
        escalationReason: 'Contains a legal threat',
      },
      OPTS
    )
    expect(msg.facts).toEqual([{ label: 'Reason', value: 'Contains a legal threat' }])
  })

  it('says "No scheduled time" rather than rendering a null date', () => {
    const msg = buildMessage(
      {
        event:         'APPROVAL_SLA_BREACH',
        workspaceName: 'Acme',
        platform:      'LINKEDIN',
        excerpt:       'Draft copy',
        scheduledAt:   null,
        waitingSinceHours: 30,
      },
      OPTS
    )
    expect(msg.facts).toContainEqual({ label: 'Scheduled', value: 'No scheduled time' })
  })

  it('singularises a one-hour wait', () => {
    const msg = buildMessage(
      {
        event: 'APPROVAL_SLA_BREACH', workspaceName: 'A', platform: 'X',
        excerpt: 'e', scheduledAt: null, waitingSinceHours: 1,
      },
      OPTS
    )
    expect(msg.facts).toContainEqual({ label: 'Waiting', value: '1 hour' })
  })

  it('renders scheduled times in the workspace timezone, not UTC', () => {
    const at = new Date('2026-08-12T00:30:00Z') // 10:30 on the 12th in Sydney
    const sydney = buildMessage(
      { event: 'POST_PENDING_APPROVAL', workspaceName: 'A', platform: 'X', excerpt: 'e', scheduledAt: at },
      OPTS
    )
    const utc = buildMessage(
      { event: 'POST_PENDING_APPROVAL', workspaceName: 'A', platform: 'X', excerpt: 'e', scheduledAt: at },
      { ...OPTS, timeZone: 'UTC' }
    )
    const valueOf = (m: typeof sydney) => m.facts?.find((f) => f.label === 'Scheduled')?.value
    expect(valueOf(sydney)).not.toBe(valueOf(utc))
    expect(valueOf(sydney)).toContain('12 Aug')
  })

  it('falls back to the calendar when a published post has no platform URL', () => {
    const msg = buildMessage(
      { event: 'POST_PUBLISHED', workspaceName: 'A', platform: 'X', excerpt: 'e', postUrl: null },
      OPTS
    )
    expect(msg.linkUrl).toBe('https://lyraonline.ai/workspace/ws_123/calendar')
    expect(msg.linkLabel).toBe('Open Calendar')
  })
})

describe('formatSlackMessage', () => {
  it('sends LYRA bot identity in platformSpecificData', () => {
    const post = formatSlackMessage(
      { title: 'T', summary: 'S', linkUrl: 'https://lyraonline.ai', linkLabel: 'Open' },
      'https://lyraonline.ai'
    )
    expect(post.platformSpecificData.username).toBe('LYRA')
    expect(post.platformSpecificData.iconUrl).toBe('https://lyraonline.ai/brand/slack-avatar')
    expect(post.content).toContain('*T*')
  })
})
