import { decrypt } from '@/lib/encrypt'
import { KlaviyoProvider } from './klaviyo'
import { MailchimpProvider } from './mailchimp'
import type { EmailProvider, KlaviyoCredentials, MailchimpCredentials } from './types'
import type { EmailConnection } from '@prisma/client'

export function getProvider(connection: EmailConnection): EmailProvider {
  const creds = JSON.parse(decrypt(connection.credentials))

  switch (connection.provider) {
    case 'KLAVIYO': {
      const { apiKey } = creds as KlaviyoCredentials
      return new KlaviyoProvider(apiKey)
    }
    case 'MAILCHIMP': {
      const { apiKey, serverPrefix } = creds as MailchimpCredentials
      return new MailchimpProvider(apiKey, serverPrefix)
    }
    default:
      throw new Error(`Unknown email provider: ${connection.provider}`)
  }
}
