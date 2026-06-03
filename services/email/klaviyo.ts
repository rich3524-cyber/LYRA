import type { EmailProvider, RawCampaign } from './types'

const BASE = 'https://a.klaviyo.com/api'
const API_VERSION = '2024-02-15'

interface KlaviyoCampaign {
  id: string
  attributes: {
    name:         string
    subject:      string
    status:       string
    scheduled_at: string | null
    send_time:    string | null
  }
}

function mapStatus(raw: string): 'scheduled' | 'sent' | 'draft' {
  switch (raw.toLowerCase()) {
    case 'scheduled': return 'scheduled'
    case 'sent':
    case 'cancelled':  return 'sent'
    default:           return 'draft'
  }
}

export class KlaviyoProvider implements EmailProvider {
  constructor(private apiKey: string) {}

  private get headers() {
    return {
      'Authorization': `Klaviyo-API-Key ${this.apiKey}`,
      'revision':       API_VERSION,
      'Accept':         'application/json',
    }
  }

  async getCampaigns(): Promise<RawCampaign[]> {
    const results: RawCampaign[] = []
    let url: string | null =
      `${BASE}/campaigns/?filter=equals(messages.channel,'email')` +
      `&filter=any(status,["Draft","Scheduled","Sent"])` +
      `&fields[campaign]=name,subject,status,scheduled_at,send_time`

    while (url) {
      const res = await fetch(url, { headers: this.headers })
      if (!res.ok) {
        // Do not embed the raw body — it may contain the API key or account data
        console.error(`[klaviyo] API error ${res.status}`)
        throw new Error(`Klaviyo returned ${res.status}. Check your API key and account permissions.`)
      }
      const json = await res.json() as {
        data:  KlaviyoCampaign[]
        links: { next?: string }
      }

      for (const c of json.data) {
        const attr = c.attributes
        results.push({
          externalId:  c.id,
          name:        attr.name,
          subjectLine: attr.subject ?? attr.name,
          status:      mapStatus(attr.status),
          scheduledAt: attr.scheduled_at ? new Date(attr.scheduled_at) : null,
          sentAt:      attr.send_time    ? new Date(attr.send_time)    : null,
        })
      }

      url = json.links?.next ?? null
    }

    return results
  }
}
