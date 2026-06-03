import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resend, FEEDBACK_RECIPIENTS } from '@/lib/resend'
import type { DisappointmentScore, TimeSavedScore, WouldPay } from '@prisma/client'

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const DISAPPOINTMENT_LABELS: Record<DisappointmentScore, string> = {
  VERY: 'Very disappointed',
  SOMEWHAT: 'Somewhat disappointed',
  NOT: 'Not disappointed',
}

const TIME_SAVED_LABELS: Record<TimeSavedScore, string> = {
  SIGNIFICANT: 'Saved significant time',
  SOME: 'Saved some time',
  NONE: 'No difference',
  MORE_WORK: 'Created more work',
}

const WOULD_PAY_LABELS: Record<WouldPay, string> = {
  YES: 'Yes',
  NO: 'No',
  MAYBE: 'Maybe',
}

function buildBetaEmail(data: {
  name: string
  email: string | null
  disappointmentScore: DisappointmentScore
  alternativeTool: string | null
  mostUsedFeature: string | null
  unusedFeatures: string | null
  aiVoiceScore: number
  timeSavedScore: TimeSavedScore
  confusingPart: string | null
  missingFeature: string | null
  priceTooExpensive: number | null
  priceCheap: number | null
  wouldPay: WouldPay
  npsScore: number
}): string {
  const rows = [
    ['Name', data.name],
    ['Email', data.email ?? '—'],
    ['Disappointment if LYRA disappeared', DISAPPOINTMENT_LABELS[data.disappointmentScore]],
    ['Would use instead', data.alternativeTool ?? '—'],
    ['Most used feature', data.mostUsedFeature ?? '—'],
    ['Unused features', data.unusedFeatures ?? '—'],
    ['AI voice score (1–5)', String(data.aiVoiceScore)],
    ['Time saved by AI', TIME_SAVED_LABELS[data.timeSavedScore]],
    ['Most confusing part', data.confusingPart ?? '—'],
    ['Missing feature', data.missingFeature ?? '—'],
    ['Price — too expensive (AUD/mo)', data.priceTooExpensive != null ? `$${data.priceTooExpensive}` : '—'],
    ['Price — suspiciously cheap (AUD/mo)', data.priceCheap != null ? `$${data.priceCheap}` : '—'],
    ['Would pay at launch', WOULD_PAY_LABELS[data.wouldPay]],
    ['NPS score (0–10)', String(data.npsScore)],
  ]

  const tableRows = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:10px 16px;color:#888888;font-size:13px;border-bottom:1px solid #222222;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
        <td style="padding:10px 16px;color:#e2e2e2;font-size:14px;border-bottom:1px solid #222222;">${esc(value)}</td>
      </tr>`
    )
    .join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#080808;margin:0;padding:32px;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;">
    <p style="color:#aaaaaa;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px;">LYRA Beta Program</p>
    <h1 style="color:#e2e2e2;font-size:24px;font-weight:500;margin:0 0 4px;">Beta Survey Response</h1>
    <p style="color:#888888;font-size:14px;margin:0 0 32px;">Submitted by ${esc(data.name)}${data.email ? ` &lt;${esc(data.email)}&gt;` : ''}</p>
    <table style="width:100%;border-collapse:collapse;background:#0f0f0f;border:1px solid #222222;border-radius:10px;overflow:hidden;">
      <tbody>${tableRows}</tbody>
    </table>
    <p style="color:#555555;font-size:12px;margin:24px 0 0;">Sent from lyraonline.ai beta feedback system</p>
  </div>
</body>
</html>`
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const {
      name,
      email,
      disappointmentScore,
      alternativeTool,
      mostUsedFeature,
      unusedFeatures,
      aiVoiceScore,
      timeSavedScore,
      confusingPart,
      missingFeature,
      priceTooExpensive,
      priceCheap,
      wouldPay,
      npsScore,
    } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    }
    if (name.length > 120) {
      return NextResponse.json({ error: 'Name is too long.' }, { status: 400 })
    }
    if (email && (typeof email !== 'string' || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
    }
    if (!['VERY', 'SOMEWHAT', 'NOT'].includes(disappointmentScore)) {
      return NextResponse.json({ error: 'Invalid disappointment score.' }, { status: 400 })
    }
    if (!['SIGNIFICANT', 'SOME', 'NONE', 'MORE_WORK'].includes(timeSavedScore)) {
      return NextResponse.json({ error: 'Invalid time saved score.' }, { status: 400 })
    }
    if (!['YES', 'NO', 'MAYBE'].includes(wouldPay)) {
      return NextResponse.json({ error: 'Invalid would-pay value.' }, { status: 400 })
    }
    if (typeof aiVoiceScore !== 'number' || !Number.isInteger(aiVoiceScore) || aiVoiceScore < 1 || aiVoiceScore > 5) {
      return NextResponse.json({ error: 'AI voice score must be 1–5.' }, { status: 400 })
    }
    if (typeof npsScore !== 'number' || !Number.isInteger(npsScore) || npsScore < 0 || npsScore > 10) {
      return NextResponse.json({ error: 'NPS score must be 0–10.' }, { status: 400 })
    }
    if (priceTooExpensive != null) {
      const n = Number(priceTooExpensive)
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        return NextResponse.json({ error: 'Invalid price value.' }, { status: 400 })
      }
    }
    if (priceCheap != null) {
      const n = Number(priceCheap)
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        return NextResponse.json({ error: 'Invalid price value.' }, { status: 400 })
      }
    }
    for (const field of [alternativeTool, mostUsedFeature, unusedFeatures, confusingPart, missingFeature]) {
      if (field && typeof field === 'string' && field.length > 5000) {
        return NextResponse.json({ error: 'Response is too long (max 5000 characters).' }, { status: 400 })
      }
    }

    const record = await prisma.betaResponse.create({
      data: {
        name:                name.trim(),
        email:               email?.trim() || null,
        disappointmentScore,
        alternativeTool:     alternativeTool?.trim() || null,
        mostUsedFeature:     mostUsedFeature?.trim() || null,
        unusedFeatures:      unusedFeatures?.trim() || null,
        aiVoiceScore,
        timeSavedScore,
        confusingPart:       confusingPart?.trim() || null,
        missingFeature:      missingFeature?.trim() || null,
        priceTooExpensive:   priceTooExpensive != null ? Number(priceTooExpensive) : null,
        priceCheap:          priceCheap != null ? Number(priceCheap) : null,
        wouldPay,
        npsScore,
      },
    })

    try {
      await resend.emails.send({
        from:    'LYRA Beta <noreply@lyraonline.ai>',
        to:      FEEDBACK_RECIPIENTS,
        subject: `LYRA Beta Feedback — ${record.name}`,
        html:    buildBetaEmail(record),
      })
    } catch (emailErr) {
      console.error('[beta-feedback] email send failed:', emailErr)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[beta-feedback] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
