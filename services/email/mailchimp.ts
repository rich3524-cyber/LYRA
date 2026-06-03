import type { EmailProvider, RawCampaign } from './types'

interface MailchimpCampaign {
  id:        string
  settings:  { subject_line: string; title: string }
  status:    string
  send_time: string
}

function mapStatus(raw: string): 'scheduled' | 'sent' | 'draft' {
  switch (raw) {
    case 'schedule': return 'scheduled'
    case 'sent':
    case 'sending':  return 'sent'
    default:         return 'draft'
  }
}

export class MailchimpProvider implements EmailProvider {
  private baseUrl: string

  constructor(private apiKey: string, private serverPrefix: string) {
    // Validate prefix format to prevent SSRF via attacker-controlled base URL
    if (!/^[a-z]{2}\d{1,3}$/.test(serverPrefix)) {
      throw new Error('Invalid Mailchimp server prefix')
    }
    this.baseUrl = `https://${serverPrefix}.api.mailchimp.com/3.0`
  }

  private get authHeader() {
    const encoded = Buffer.from(`anystring:${this.apiKey}`).toString('base64')
    return { 'Authorization': `Basic ${encoded}`, 'Accept': 'application/json' }
  }

  async getCampaigns(): Promise<RawCampaign[]> {
    const results: RawCampaign[] = []
    const pageSize = 100
    let offset = 0
    let total  = Infinity

    while (offset < total) {
      const url = `${this.baseUrl}/campaigns?status=schedule,sent&count=${pageSize}&offset=${offset}` +
        `&fields=campaigns.id,campaigns.settings.subject_line,campaigns.settings.title,campaigns.status,campaigns.send_time,total_items`

      const res = await fetch(url, { headers: this.authHeader })
      if (!res.ok) {
        // Do not embed the raw body — it may contain the API key or account data
        console.error(`[mailchimp] API error ${res.status}`)
        throw new Error(`Mailchimp returned ${res.status}. Check your API key and server prefix.`)
      }
      const json = await res.json() as {
        campaigns:   MailchimpCampaign[]
        total_items: number
      }

      total = json.total_items

      for (const c of json.campaigns) {
        const isScheduled = c.status === 'schedule'
        const isSent      = c.status === 'sent' || c.status === 'sending'
        const sendDate    = c.send_time ? new Date(c.send_time) : null

        results.push({
          externalId:  c.id,
          name:        c.settings.title || c.settings.subject_line,
          subjectLine: c.settings.subject_line,
          status:      mapStatus(c.status),
          scheduledAt: isScheduled ? sendDate : null,
          sentAt:      isSent      ? sendDate : null,
        })
      }

      offset += json.campaigns.length
      if (json.campaigns.length === 0) break
    }

    return results
  }
}
