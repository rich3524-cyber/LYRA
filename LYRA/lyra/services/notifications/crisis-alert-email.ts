import { prisma } from '@/lib/prisma'
import { resend, EMAIL_FROM } from '@/lib/resend'
import { PLATFORM_LABELS } from '@/lib/platform-labels'
import type { Platform } from '@prisma/client'

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
  if (text.length <= maxLength) return text
  // Array.from splits on code points, not UTF-16 code units -- plain
  // .slice(0, maxLength) can cut a surrogate pair (emoji, some CJK) in half,
  // leaving a lone surrogate that renders as a broken-character glyph.
  return Array.from(text).slice(0, maxLength).join('')
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
              ${escapeHtml(comment.authorName)} · ${escapeHtml(PLATFORM_LABELS[comment.platform as Platform] ?? comment.platform)}
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

export async function sendCrisisAlertEmail(
  workspaceId: string,
  triggerType: 'KEYWORD_MATCH' | 'SENTIMENT_SPIKE',
  commentIds: string[]
): Promise<void> {
  try {
    const [workspace, owners, comment] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
      prisma.workspaceAccess.findMany({
        where: { workspaceId, role: { in: ['SMB_OWNER', 'AGENCY_ADMIN'] } },
        select: { user: { select: { email: true } } },
      }),
      commentIds[0]
        ? prisma.comment.findUnique({
            where:  { id: commentIds[0] },
            select: { content: true, authorName: true, socialAccount: { select: { platform: true } } },
          })
        : Promise.resolve(null),
    ])

    if (!workspace) {
      console.error(`Crisis alert email: workspace ${workspaceId} not found`)
      return
    }

    if (owners.length === 0) {
      console.log(`Crisis alert email: no owner/admin recipients for workspace ${workspaceId}`)
      return
    }

    const { subject, html } = buildCrisisAlertEmail({
      workspaceName: workspace.name,
      workspaceId,
      triggerType,
      comment: comment
        ? { content: comment.content, authorName: comment.authorName, platform: comment.socialAccount.platform }
        : null,
      appBaseUrl: process.env.APP_BASE_URL!,
    })

    // Resend's SDK does not throw on an API-level failure (invalid recipient,
    // domain/sending issues, etc.) -- it resolves with { data, error }. Without
    // explicitly checking `error`, a real failure would silently look like
    // success to this function's own try/catch, defeating the point of even
    // logging failures. Still never throws past this point -- fail-open stays
    // intact -- but a real failure is now actually visible in logs.
    //
    // Promise.allSettled (not Promise.all) -- a crisis alert can go to several
    // owners/admins, and one send rejecting (network error, etc.) must not
    // abort the rest. Every recipient gets an attempt regardless of another's
    // failure -- this is a safety-critical notification, not a best-effort one.
    const results = await Promise.allSettled(
      owners.map((o) =>
        resend.emails.send({
          from:    EMAIL_FROM,
          to:      o.user.email,
          subject,
          html,
        })
      )
    )

    const failures = results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)
    )
    if (failures.length > 0) {
      console.error(
        `Crisis alert email: ${failures.length}/${owners.length} sends failed for workspace ${workspaceId}:`,
        failures.map((f) => (f.status === 'rejected' ? f.reason : f.value.error))
      )
    }
    const sentCount = owners.length - failures.length
    if (sentCount > 0) {
      console.log(`Crisis alert email sent to ${sentCount}/${owners.length} recipient(s) for workspace ${workspaceId}`)
    }
  } catch (error) {
    // Fail open -- an email failure must never affect crisis detection itself.
    // crisisActive and the CrisisEvent are already recorded by the caller
    // before this function is ever invoked.
    console.error(`Crisis alert email failed for workspace ${workspaceId}:`, error)
  }
}
