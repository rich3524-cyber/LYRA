import { safeFetch } from '@/lib/safe-fetch'
import type { EmailCampaignData } from './klaviyo-campaigns'

// A real Mailchimp datacenter suffix is always 2 letters + 1-3 digits (us1,
// us21, ...). The previous check (non-empty, <=10 chars) let almost any
// string through -- e.g. an apiKey of "x-evil.io/" extracts a "server" of
// "evil.io/", which the caller below interpolates directly into a hostname
// (`${server}.api.mailchimp.com`), producing a request to a host the caller
// chose, not Mailchimp's.
const MAILCHIMP_SERVER_PATTERN = /^[a-z]{2}\d{1,3}$/

export function extractMailchimpServer(apiKey: string): string {
  const parts = apiKey.split('-')
  const server = parts[parts.length - 1]
  if (!server || parts.length < 2 || !MAILCHIMP_SERVER_PATTERN.test(server)) {
    throw new Error(
      'Invalid Mailchimp API key format — expected a key ending in -us1, -us2, etc.'
    )
  }
  return server
}

export async function validateMailchimpKey(apiKey: string): Promise<string> {
  const server = extractMailchimpServer(apiKey)
  const encoded = Buffer.from(`anystring:${apiKey}`).toString('base64')
  const res = await safeFetch(`https://${server}.api.mailchimp.com/3.0/`, {
    headers: { 'Authorization': `Basic ${encoded}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error('Invalid Mailchimp API key')
  const data = await res.json() as { account_name?: string }
  return data.account_name ?? 'Mailchimp Account'
}

export async function fetchMailchimpCampaigns(
  apiKey: string,
  serverPrefix: string
): Promise<EmailCampaignData[]> {
  const encoded = Buffer.from(`anystring:${apiKey}`).toString('base64')
  const url =
    `https://${serverPrefix}.api.mailchimp.com/3.0/campaigns` +
    `?count=100&fields=campaigns.id,campaigns.settings.title,campaigns.settings.subject_line,campaigns.status,campaigns.send_time`

  const res = await safeFetch(url, {
    headers: { 'Authorization': `Basic ${encoded}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Mailchimp campaigns fetch failed: ${res.status}`)

  const json = await res.json() as {
    campaigns?: Array<{
      id: string
      settings: { title: string; subject_line: string }
      status: string
      send_time: string
    }>
  }

  return (json.campaigns ?? [])
    .filter((c) => ['schedule', 'paused', 'save'].includes(c.status))
    .map((c) => ({
      externalId: c.id,
      name: c.settings.title || 'Untitled',
      subject: c.settings.subject_line || null,
      scheduledAt: c.send_time ? new Date(c.send_time) : null,
      status: c.status === 'schedule' ? 'SCHEDULED' : c.status.toUpperCase(),
      previewUrl: null,
    }))
}
