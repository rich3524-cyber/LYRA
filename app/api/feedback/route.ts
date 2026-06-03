import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resend, FEEDBACK_RECIPIENTS } from '@/lib/resend'
import type { FeedbackType } from '@prisma/client'

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  BUG_REPORT:      'Bug report',
  FEATURE_REQUEST: 'Feature request',
  GENERAL:         'General feedback',
  PRAISE:          'Praise',
}

function buildFeedbackEmail(data: {
  name: string
  feedbackType: FeedbackType
  description: string
  rating: number
}): string {
  const stars = '★'.repeat(data.rating) + '☆'.repeat(5 - data.rating)

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#080808;margin:0;padding:32px;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;">
    <p style="color:#aaaaaa;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px;">LYRA Beta Program</p>
    <h1 style="color:#e2e2e2;font-size:24px;font-weight:500;margin:0 0 4px;">Feedback — ${esc(FEEDBACK_TYPE_LABELS[data.feedbackType])}</h1>
    <p style="color:#888888;font-size:14px;margin:0 0 32px;">Submitted by ${esc(data.name)}</p>
    <table style="width:100%;border-collapse:collapse;background:#0f0f0f;border:1px solid #222222;border-radius:10px;overflow:hidden;">
      <tbody>
        <tr>
          <td style="padding:10px 16px;color:#888888;font-size:13px;border-bottom:1px solid #222222;white-space:nowrap;vertical-align:top;">Type</td>
          <td style="padding:10px 16px;color:#e2e2e2;font-size:14px;border-bottom:1px solid #222222;">${esc(FEEDBACK_TYPE_LABELS[data.feedbackType])}</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;color:#888888;font-size:13px;border-bottom:1px solid #222222;white-space:nowrap;vertical-align:top;">Rating</td>
          <td style="padding:10px 16px;color:#d8d8d8;font-size:18px;border-bottom:1px solid #222222;">${esc(stars)} (${data.rating}/5)</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;color:#888888;font-size:13px;vertical-align:top;">Feedback</td>
          <td style="padding:10px 16px;color:#e2e2e2;font-size:14px;line-height:1.6;">${esc(data.description).replace(/\n/g, '<br>')}</td>
        </tr>
      </tbody>
    </table>
    <p style="color:#555555;font-size:12px;margin:24px 0 0;">Sent from lyraonline.ai beta feedback system</p>
  </div>
</body>
</html>`
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, feedbackType, description, rating } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    }
    if (name.length > 120) {
      return NextResponse.json({ error: 'Name is too long.' }, { status: 400 })
    }
    if (!['BUG_REPORT', 'FEATURE_REQUEST', 'GENERAL', 'PRAISE'].includes(feedbackType)) {
      return NextResponse.json({ error: 'Invalid feedback type.' }, { status: 400 })
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return NextResponse.json({ error: 'Description is required.' }, { status: 400 })
    }
    if (description.length > 5000) {
      return NextResponse.json({ error: 'Description is too long (max 5000 characters).' }, { status: 400 })
    }
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be 1–5.' }, { status: 400 })
    }

    const record = await prisma.feedbackResponse.create({
      data: {
        name:        name.trim(),
        feedbackType,
        description: description.trim(),
        rating,
      },
    })

    try {
      await resend.emails.send({
        from:    'LYRA Beta <noreply@lyraonline.ai>',
        to:      FEEDBACK_RECIPIENTS,
        subject: `LYRA Feedback — ${FEEDBACK_TYPE_LABELS[record.feedbackType]} from ${record.name}`,
        html:    buildFeedbackEmail(record),
      })
    } catch (emailErr) {
      console.error('[feedback] email send failed:', emailErr)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[feedback] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
