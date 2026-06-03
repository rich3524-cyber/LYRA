import type { EmailProvider, RawCampaign } from './types'

const BASE = 'https://a.klaviyo.com/api'
const API_VERSION = '2024-02-15'

interface KlaviyoCampaign {
  id:   string
  type: 'campaign'
  attributes: {
    name:          string
    status:        string
    send_strategy?: {
      method:   string
      datetime: string | null
    }
    scheduled_at?: string | null
  }
  relationships?: {
    'campaign-messages'?: {
      data: Array<{ type: string; id: string }>
    }
  }
}

interface KlaviyoCampaignMessage {
  id:         string
  type:       'campaign-message'
  attributes: {
    content?: { subject?: string }
  }
}

function mapStatus(raw: string): 'scheduled' | 'sent' | 'draft' {
  switch (raw.toLowerCase()) {
    case 'scheduled': return 'scheduled'
    case 'sent':
    case 'sending':
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

    // Klaviyo requires a channel filter — it rejects requests without one.
    // Use plain template literals (not URLSearchParams) so brackets and
    // single quotes are not percent-encoded, which Klaviyo also rejects.
    // No fields[campaign] restriction — avoids invalid field name errors.
    let url: string | null =
      `${BASE}/campaigns/` +
      `?filter=equals(messages.channel,'email')` +
      `&filter=any(status,["Draft","Scheduled","Sent","Sending"])` +
      `&include=campaign-messages`

    while (url) {
      const res = await fetch(url, { headers: this.headers })
      if (!res.ok) {
        console.error(`[klaviyo] API error ${res.status}`)
        throw new Error(`Klaviyo returned ${res.status}. Check your API key and account permissions.`)
      }

      const json = await res.json() as {
        data:     KlaviyoCampaign[]
        included?: KlaviyoCampaignMessage[]
        links:    { next?: string | null }
      }

      // Build subject-line map from included campaign-message resources
      const subjectByMsgId = new Map<string, string>()
      for (const msg of (json.included ?? [])) {
        if (msg.type === 'campaign-message' && msg.attributes?.content?.subject) {
          subjectByMsgId.set(msg.id, msg.attributes.content.subject)
        }
      }

      for (const c of json.data) {
        const attr   = c.attributes
        const status = mapStatus(attr.status)

        // Send time: prefer send_strategy.datetime, fall back to scheduled_at
        const sendDateStr =
          attr.send_strategy?.datetime ??
          attr.scheduled_at ??
          null
        const sendDate = sendDateStr ? new Date(sendDateStr) : null

        // Subject: first linked campaign-message, fall back to campaign name
        const firstMsgId  = c.relationships?.['campaign-messages']?.data?.[0]?.id
        const subjectLine = (firstMsgId && subjectByMsgId.get(firstMsgId)) || attr.name

        results.push({
          externalId:  c.id,
          name:        attr.name,
          subjectLine,
          status,
          scheduledAt: status === 'scheduled' ? sendDate : null,
          sentAt:      status === 'sent'      ? sendDate : null,
        })
      }

      url = json.links?.next ?? null
    }

    return results
  }
}
