export interface CrisisAlertEmailComment {
  content:     string
  authorName:  string
  platform:    string
}

export interface CrisisAlertEmailParams {
  workspaceName: string
  workspaceId:   string
  triggerType:   'KEYWORD_MATCH' | 'SENTIMENT_SPIKE'
  comment:       CrisisAlertEmailComment | null
  appBaseUrl:    string
}

const PLATFORM_NAMES: Record<string, string> = {
  FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok', TWITTER: 'X', GOOGLE_BUSINESS: 'Google Business',
  YOUTUBE: 'YouTube', PINTEREST: 'Pinterest', THREADS: 'Threads', BLUESKY: 'Bluesky',
}

const TRIGGER_DESCRIPTIONS: Record<CrisisAlertEmailParams['triggerType'], string> = {
  KEYWORD_MATCH:   'A comment matched an escalation keyword.',
  SENTIMENT_SPIKE: 'Multiple genuinely negative comments were detected in a short window.',
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

export function buildCrisisAlertEmail(
  params: CrisisAlertEmailParams
): { subject: string; html: string } {
  const { workspaceName, workspaceId, triggerType, comment, appBaseUrl } = params
  const inboxUrl = `${appBaseUrl}/workspace/${workspaceId}/inbox`

  const excerptBlock = comment
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background: #f5f5f5; border-radius: 8px;">
        <tr>
          <td style="padding: 16px 20px;">
            <p style="margin: 0 0 6px; font-size: 13px; color: #666666;">
              ${escapeHtml(comment.authorName)} · ${escapeHtml(PLATFORM_NAMES[comment.platform] ?? comment.platform)}
            </p>
            <p style="margin: 0; font-size: 14px; color: #111111; line-height: 1.5;">
              "${escapeHtml(truncate(comment.content, 150))}${comment.content.length > 150 ? '…' : ''}"
            </p>
          </td>
        </tr>
      </table>
    `
    : ''

  const html = `
    <div style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #111111;">
      <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #dc2626;">
        Crisis Aware Alert
      </p>
      <h1 style="margin: 0 0 16px; font-size: 20px; color: #111111;">
        ${escapeHtml(workspaceName)}
      </h1>
      <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.6; color: #333333;">
        ${TRIGGER_DESCRIPTIONS[triggerType]}
      </p>
      <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #333333;">
        Scheduled posts for this workspace are paused until this is resolved in LYRA.
      </p>
      ${excerptBlock}
      <a href="${inboxUrl}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background: #111111; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
        Review in Inbox
      </a>
    </div>
  `

  return {
    subject: `Crisis Aware alert — ${workspaceName}`,
    html,
  }
}
