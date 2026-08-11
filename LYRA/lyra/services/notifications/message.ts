// Platform-neutral shape every channel formatter renders from. Slack renders it
// to mrkdwn; a future Teams formatter renders the same object to an Adaptive
// Card. Trigger sites build one of the inputs below and never touch
// platform-specific formatting.

export interface ChannelMessage {
  /** Bold first line, e.g. "Crisis detected — Acme Co". */
  title: string
  /** One sentence of context under the title. */
  summary: string
  /** Optional quoted excerpt (a comment, a failure reason). */
  quote?: { text: string; attribution?: string }
  /** Small "Label: value" metadata rows. */
  facts?: Array<{ label: string; value: string }>
  linkUrl: string
  linkLabel: string
}

export type NotificationInput =
  | {
      event: 'CRISIS_DETECTED'
      workspaceName: string
      triggerType: 'KEYWORD_MATCH' | 'SENTIMENT_SPIKE'
      comment?: { content: string; authorName: string; platform: string } | null
    }
  | {
      event: 'POST_FAILED'
      workspaceName: string
      platform: string
      failureReason?: string | null
      excerpt: string
    }
  | {
      event: 'POST_PENDING_APPROVAL'
      workspaceName: string
      platform: string
      excerpt: string
      scheduledAt?: Date | null
      authorName?: string | null
    }
  | {
      event: 'APPROVAL_SLA_BREACH'
      workspaceName: string
      platform: string
      excerpt: string
      scheduledAt?: Date | null
      waitingSinceHours: number
    }
  | {
      event: 'POST_PUBLISHED'
      workspaceName: string
      platform: string
      excerpt: string
      postUrl?: string | null
    }
  | {
      event: 'TEST'
      workspaceName: string
    }

const CRISIS_TRIGGER_TEXT: Record<'KEYWORD_MATCH' | 'SENTIMENT_SPIKE', string> = {
  KEYWORD_MATCH:   'A comment matched an escalation keyword.',
  SENTIMENT_SPIKE: 'Multiple genuinely negative comments were detected in a short window.',
}

// Slack collapses long messages behind a "show more" fold. An alert that needs
// a click to read its own excerpt defeats the point, so excerpts are trimmed.
const EXCERPT_LIMIT = 180

export function truncate(text: string, maxLength: number = EXCERPT_LIMIT): string {
  // Array.from splits on code points, not UTF-16 code units -- plain slice can
  // cut a surrogate pair (emoji, some CJK) in half and leave a broken glyph.
  // Same reasoning as services/notifications/crisis-alert-email.ts.
  const chars = Array.from(text)
  if (chars.length <= maxLength) return text
  return chars.slice(0, maxLength).join('') + '…'
}

function formatWhen(date: Date | null | undefined, timeZone: string): string {
  if (!date) return 'No scheduled time'
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day:     'numeric',
    month:   'short',
    hour:    'numeric',
    minute:  '2-digit',
    timeZone,
  }).format(date)
}

export interface BuildMessageOptions {
  workspaceId: string
  appBaseUrl: string
  /** Workspace timezone, so a scheduled time reads correctly for the team. */
  timeZone?: string
}

export function buildMessage(input: NotificationInput, opts: BuildMessageOptions): ChannelMessage {
  const { workspaceId, appBaseUrl } = opts
  const timeZone = opts.timeZone || 'UTC'
  const base = `${appBaseUrl}/workspace/${workspaceId}`

  switch (input.event) {
    case 'CRISIS_DETECTED':
      return {
        title:   `Crisis detected — ${input.workspaceName}`,
        summary: `${CRISIS_TRIGGER_TEXT[input.triggerType]} Scheduled posts are paused until this is resolved.`,
        quote:   input.comment
          ? {
              text:        truncate(input.comment.content),
              attribution: `${input.comment.authorName} · ${input.comment.platform}`,
            }
          : undefined,
        linkUrl:   `${base}/inbox`,
        linkLabel: 'Review in Inbox',
      }

    case 'POST_FAILED':
      return {
        title:   `Post failed to publish — ${input.workspaceName}`,
        summary: `A scheduled post could not be published to ${input.platform}.`,
        quote:   { text: truncate(input.excerpt) },
        facts:   input.failureReason
          ? [{ label: 'Reason', value: truncate(input.failureReason, 200) }]
          : undefined,
        linkUrl:   `${base}/calendar`,
        linkLabel: 'Open Calendar',
      }

    case 'POST_PENDING_APPROVAL':
      return {
        title:   `Post pending approval — ${input.workspaceName}`,
        summary: `A ${input.platform} post is waiting for a reviewer.`,
        quote:   { text: truncate(input.excerpt) },
        facts:   [
          { label: 'Scheduled', value: formatWhen(input.scheduledAt, timeZone) },
          ...(input.authorName ? [{ label: 'Author', value: input.authorName }] : []),
        ],
        linkUrl:   `${base}/calendar`,
        linkLabel: 'Review post',
      }

    case 'APPROVAL_SLA_BREACH':
      return {
        title:   `Approval overdue — ${input.workspaceName}`,
        summary: `A ${input.platform} post has been waiting for approval past its deadline.`,
        quote:   { text: truncate(input.excerpt) },
        facts:   [
          { label: 'Scheduled', value: formatWhen(input.scheduledAt, timeZone) },
          { label: 'Waiting', value: `${input.waitingSinceHours} hour${input.waitingSinceHours === 1 ? '' : 's'}` },
        ],
        linkUrl:   `${base}/calendar`,
        linkLabel: 'Approve now',
      }

    case 'POST_PUBLISHED':
      return {
        title:     `Post published — ${input.workspaceName}`,
        summary:   `A scheduled post went live on ${input.platform}.`,
        quote:     { text: truncate(input.excerpt) },
        linkUrl:   input.postUrl || `${base}/calendar`,
        linkLabel: input.postUrl ? 'View post' : 'Open Calendar',
      }

    case 'TEST':
      return {
        title:     `LYRA is connected — ${input.workspaceName}`,
        summary:   'This is a test message. Alerts for this workspace will arrive in this channel.',
        linkUrl:   `${base}/settings`,
        linkLabel: 'Notification settings',
      }
  }
}
