'use client'

import { Mail } from 'lucide-react'

export interface CalendarEmailCampaign {
  id: string
  name: string
  subject: string | null
  scheduledAt: string | null
  status: string
  previewUrl: string | null
  integration: { provider: string }
}

const PROVIDER_LABELS: Record<string, string> = {
  KLAVIYO:     'Klaviyo',
  MAILCHIMP:   'Mailchimp',
  CUSTOMER_IO: 'Customer.io',
}

const EMAIL_COLOR = '#6366f1' // indigo — distinct from all social platform colours

export function EmailCampaignCard({ campaign }: { campaign: CalendarEmailCampaign }) {
  return (
    <div
      className="rounded bg-indigo-500/10 border border-indigo-500/30 flex items-start gap-1 p-1 select-none"
      title={campaign.subject ?? campaign.name}
    >
      <Mail
        size={10}
        strokeWidth={1.5}
        className="shrink-0 mt-0.5 text-indigo-400"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="font-mono text-[10px] text-indigo-400">
            {PROVIDER_LABELS[campaign.integration.provider] ?? 'Email'}
          </span>
          <span
            className="font-sans text-[10px] uppercase tracking-wide px-1 rounded-full"
            style={{ color: EMAIL_COLOR, background: `${EMAIL_COLOR}22` }}
          >
            {campaign.status.toLowerCase().replace(/_/g, ' ')}
          </span>
        </div>
        <p className="font-sans text-[12px] text-text-secondary leading-tight line-clamp-2">
          {campaign.subject || campaign.name}
        </p>
      </div>
    </div>
  )
}
