export interface RawCampaign {
  externalId:  string
  name:        string
  subjectLine: string
  status:      'scheduled' | 'sent' | 'draft'
  scheduledAt: Date | null
  sentAt:      Date | null
}

export interface EmailProvider {
  getCampaigns(): Promise<RawCampaign[]>
}

export type KlaviyoCredentials   = { apiKey: string }
export type MailchimpCredentials = { apiKey: string; serverPrefix: string }
