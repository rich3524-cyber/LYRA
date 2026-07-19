import { safeFetch } from '@/lib/safe-fetch'
import type { EmailCampaignData } from './klaviyo-campaigns'

export async function validateCustomerioKey(apiKey: string): Promise<string> {
  const res = await safeFetch('https://api.customer.io/v1/info', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error('Invalid Customer.io API key')
  const data = await res.json() as { account?: { name?: string } }
  return data.account?.name ?? 'Customer.io Account'
}

export async function fetchCustomerioCampaigns(apiKey: string): Promise<EmailCampaignData[]> {
  const res = await safeFetch('https://api.customer.io/v1/newsletters', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Customer.io newsletters fetch failed: ${res.status}`)

  const json = await res.json() as {
    newsletters?: Array<{
      id: number
      name: string
      state: string
      send_at?: number | null
    }>
  }

  return (json.newsletters ?? [])
    .filter((n) => ['draft', 'scheduled'].includes(n.state))
    .map((n) => ({
      externalId: String(n.id),
      name: n.name,
      subject: null,
      scheduledAt: n.send_at ? new Date(n.send_at * 1000) : null,
      status: n.state.toUpperCase(),
      previewUrl: null,
    }))
}
