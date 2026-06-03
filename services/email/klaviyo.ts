import { request as httpsRequest } from 'node:https'
import type { EmailProvider, RawCampaign } from './types'

const HOST        = 'a.klaviyo.com'
const BASE_PATH   = '/api'
const API_VERSION = '2024-02-15'

interface KlaviyoCampaign {
  id:   string
  type: 'campaign'
  attributes: {
    name:           string
    status:         string
    send_strategy?: { method: string; datetime: string | null }
    scheduled_at?:  string | null
  }
  relationships?: {
    'campaign-messages'?: { data: Array<{ type: string; id: string }> }
  }
}

interface KlaviyoCampaignMessage {
  id:         string
  type:       'campaign-message'
  attributes: { content?: { subject?: string } }
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

  // Use Node.js https.request so the path string is sent exactly as-is.
  // fetch() uses the WHATWG URL parser which encodes ' → %27 and " → %22
  // in query strings for https URLs — Klaviyo's filter parser rejects that.
  private get(path: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const req = httpsRequest(
        {
          hostname: HOST,
          path,
          method:   'GET',
          headers: {
            Authorization: `Klaviyo-API-Key ${this.apiKey}`,
            revision:       API_VERSION,
            Accept:         'application/json',
          },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8')
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`Klaviyo ${res.statusCode}: ${body}`))
              return
            }
            try { resolve(JSON.parse(body)) }
            catch { reject(new Error('Invalid JSON response from Klaviyo')) }
          })
        }
      )
      req.on('error', reject)
      req.end()
    })
  }

  async getCampaigns(): Promise<RawCampaign[]> {
    const results: RawCampaign[] = []

    // Literal path — single and double quotes sent unchanged to Klaviyo
    let path: string | null =
      `${BASE_PATH}/campaigns/` +
      `?filter=equals(messages.channel,'email')` +
      `&filter=any(status,["Draft","Scheduled","Sent","Sending"])` +
      `&include=campaign-messages`

    while (path) {
      const json = this.get(path) as unknown
      const page = await json as {
        data:      KlaviyoCampaign[]
        included?: KlaviyoCampaignMessage[]
        links:     { next?: string | null }
      }

      // Map included campaign-messages by ID for subject-line lookup
      const subjectByMsgId = new Map<string, string>()
      for (const msg of (page.included ?? [])) {
        if (msg.type === 'campaign-message' && msg.attributes?.content?.subject) {
          subjectByMsgId.set(msg.id, msg.attributes.content.subject)
        }
      }

      for (const c of page.data) {
        const attr    = c.attributes
        const status  = mapStatus(attr.status)
        const sendDt  = attr.send_strategy?.datetime ?? attr.scheduled_at ?? null
        const sendDate = sendDt ? new Date(sendDt) : null

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

      // Klaviyo next link is a full URL — extract path + query only
      const nextHref = page.links?.next
      if (nextHref) {
        try {
          const u = new URL(nextHref)
          path = u.pathname + u.search
        } catch {
          path = null
        }
      } else {
        path = null
      }
    }

    return results
  }
}
