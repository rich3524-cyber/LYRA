import type { EmailProvider, RawCampaign } from './types'

const BASE = 'https://a.klaviyo.com/api'
const API_VERSION = '2024-02-15'

// Klaviyo v3 campaign attributes (valid field names)
interface KlaviyoCampaignAttributes {
  name:          string
  status:        string          // Draft | Scheduled | Sending | Sent | Cancelled | Archived
  send_strategy: {
    method:   string             // static | smart_send_time | continuous
    datetime: string | null      // ISO send datetime for static sends
  } | null
}

interface KlaviyoCampaign {
  id:   string
  type: 'campaign'
  attributes: KlaviyoCampaignAttributes
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

    // Valid campaign fields + include campaign-messages for subject lines
    const params = new URLSearchParams({
      'filter':                    "equals(messages.channel,'email')",
      'fields[campaign]':          'name,status,send_strategy',
      'include':                   'campaign-messages',
      'fields[campaign-message]':  'content.subject',
    })
    // Add second filter — Klaviyo ANDs multiple filter params
    params.append('filter', 'any(status,["Draft","Scheduled","Sent","Sending"])')

    let url: string | null = `${BASE}/campaigns/?${params.toString()}`

    while (url) {
      const res = await fetch(url, { headers: this.headers })
      if (!res.ok) {
        console.error(`[klaviyo] API error ${res.status}`)
        throw new Error(`Klaviyo returned ${res.status}. Check your API key and account permissions.`)
      }

      const json = await res.json() as {
        data:     KlaviyoCampaign[]
        included: KlaviyoCampaignMessage[]
        links:    { next?: string | null }
      }

      // Build a subject-line map from the included campaign-messages
      const subjectByMessageId = new Map<string, string>()
      for (const msg of (json.included ?? [])) {
        if (msg.type === 'campaign-message' && msg.attributes?.content?.subject) {
          subjectByMessageId.set(msg.id, msg.attributes.content.subject)
        }
      }

      for (const c of json.data) {
        const attr    = c.attributes
        const sendDt  = attr.send_strategy?.datetime ?? null
        const status  = mapStatus(attr.status)

        // Get subject from the first related campaign-message
        const firstMsgId  = c.relationships?.['campaign-messages']?.data?.[0]?.id
        const subjectLine = (firstMsgId && subjectByMessageId.get(firstMsgId)) || attr.name

        results.push({
          externalId:  c.id,
          name:        attr.name,
          subjectLine,
          status,
          scheduledAt: status === 'scheduled' && sendDt ? new Date(sendDt) : null,
          sentAt:      status === 'sent'      && sendDt ? new Date(sendDt) : null,
        })
      }

      url = json.links?.next ?? null
    }

    return results
  }
}
