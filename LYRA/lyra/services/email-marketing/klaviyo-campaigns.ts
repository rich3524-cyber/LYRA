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

export async function fetchKlaviyoCampaigns(apiKey: string): Promise<EmailCampaignData[]> {
  const url =
    `https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,'email')` +
    `&fields[campaign]=name,status,scheduled_at`

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
      attributes: { name: string; status: string; scheduled_at?: string | null }
    }>
  }

  return (json.data ?? [])
    .filter((c) => ['Draft', 'Scheduled'].includes(c.attributes.status))
    .map((c) => ({
      externalId: c.id,
      name: c.attributes.name,
      subject: null,
      scheduledAt: c.attributes.scheduled_at
        ? new Date(c.attributes.scheduled_at)
        : null,
      status: c.attributes.status.toUpperCase(),
      previewUrl: null,
    }))
}
