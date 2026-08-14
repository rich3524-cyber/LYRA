// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmailCampaignCard, type CalendarEmailCampaign } from './email-campaign-card'

function makeCampaign(overrides: Partial<CalendarEmailCampaign> = {}): CalendarEmailCampaign {
  return {
    id: 'camp-1',
    name: 'August Newsletter',
    subject: 'Your August roundup is here',
    scheduledAt: '2026-08-20T09:00:00.000Z',
    status: 'SCHEDULED',
    previewUrl: null,
    integration: { provider: 'MAILCHIMP' },
    ...overrides,
  }
}

describe('EmailCampaignCard', () => {
  it('renders the campaign subject, mapped provider label, and formatted status', () => {
    render(<EmailCampaignCard campaign={makeCampaign()} />)

    expect(screen.getByText('Your August roundup is here')).toBeInTheDocument()
    expect(screen.getByText('Mailchimp')).toBeInTheDocument()
    expect(screen.getByText('scheduled')).toBeInTheDocument()
  })

  it('falls back to the campaign name when there is no subject', () => {
    render(<EmailCampaignCard campaign={makeCampaign({ subject: null })} />)

    expect(screen.getByText('August Newsletter')).toBeInTheDocument()
  })

  it('replaces underscores in the status with spaces', () => {
    render(<EmailCampaignCard campaign={makeCampaign({ status: 'PENDING_APPROVAL' })} />)

    expect(screen.getByText('pending approval')).toBeInTheDocument()
  })

  it('falls back to a generic "Email" label for an unrecognised provider', () => {
    render(
      <EmailCampaignCard
        campaign={makeCampaign({ integration: { provider: 'SOME_UNKNOWN_ESP' } })}
      />
    )

    expect(screen.getByText('Email')).toBeInTheDocument()
  })

  it('sets the card title to the subject for a native tooltip', () => {
    const { container } = render(<EmailCampaignCard campaign={makeCampaign()} />)

    const card = container.querySelector('[title]')
    expect(card).toHaveAttribute('title', 'Your August roundup is here')
  })
})
