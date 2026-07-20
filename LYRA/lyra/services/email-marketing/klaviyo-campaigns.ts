import { safeFetch } from '@/lib/safe-fetch'

export type EmailCampaignData = {
  externalId: string
  name: string
  subject: string | null
  scheduledAt: Date | null
  status: string
  previewUrl: string | null
}

export async function validateKlaviyoKey(apiKey: string): Promise<string> {
  const res = await safeFetch('https://a.klaviyo.com/api/accounts/', {
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'revision': '2024-10-15',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error('Invalid Klaviyo API key')
  const data = await res.json() as {
    data?: Array<{ attributes?: { contact_information?: { organization_name?: string } } }>
  }
  return data.data?.[0]?.attributes?.contact_information?.organization_name ?? 'Klaviyo Account'
}

// Klaviyo campaign status -> LYRA calendar status. Sent maps to PUBLISHED (not a
// literal "SENT") so it renders identically to a published social post on the
// Calendar, matching what the rest of the app already does for every other
// platform -- confirmed live 2026-07-21 against a real campaign that had gone
// from Scheduled to Sent since the last sync.
const STATUS_MAP: Record<string, string> = {
  Draft:     'DRAFT',
  Scheduled: 'SCHEDULED',
  Sent:      'PUBLISHED',
}

export async function fetchKlaviyoCampaigns(apiKey: string): Promise<EmailCampaignData[]> {
  // Bounded to campaigns touched in the last 30 days -- broad enough to catch a
  // Scheduled campaign that has since sent, without pulling in an account's
  // entire multi-year send history (Sent campaigns are otherwise unbounded, and
  // this endpoint isn't paginated here). and(...) combinator syntax confirmed
  // live 2026-07-21.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const url =
    `https://a.klaviyo.com/api/campaigns/?filter=` +
    `and(equals(messages.channel,'email'),greater-or-equal(updated_at,${since}))` +
    `&fields[campaign]=name,status,send_time`

  const res = await safeFetch(url, {
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'revision': '2024-10-15',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Klaviyo campaigns fetch failed: ${res.status}`)

  const json = await res.json() as {
    data?: Array<{
      id: string
      attributes: { name: string; status: string; send_time?: string | null }
    }>
  }

  // send_time is the actual calculated send datetime -- confirmed live 2026-07-20
  // by comparing against a real campaign. scheduled_at is a decoy: it's the
  // timestamp the campaign was *scheduled at* (an audit field), not when it will
  // send, and using it put campaigns on the calendar a full day off whenever the
  // scheduling action and the send time crossed a UTC-to-local day boundary.
  return (json.data ?? [])
    .filter((c) => c.attributes.status in STATUS_MAP)
    .map((c) => ({
      externalId: c.id,
      name: c.attributes.name,
      subject: null,
      scheduledAt: c.attributes.send_time
        ? new Date(c.attributes.send_time)
        : null,
      status: STATUS_MAP[c.attributes.status],
      previewUrl: null,
    }))
}
