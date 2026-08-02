import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/encrypt'
import { fetchKlaviyoCampaigns } from './klaviyo-campaigns'
import { fetchMailchimpCampaigns } from './mailchimp-campaigns'
import { fetchCustomerioCampaigns } from './customerio-campaigns'

// EmailIntegration.apiKey was stored in plaintext before this field was brought
// in line with SocialAccount/SeoConnection's encrypted tokens. decrypt() throws
// on any value it didn't itself produce (undersized/malformed iv+tag prefix, or
// GCM auth-tag verification failure) -- there is no ambiguous case, so any
// failure here means "never encrypted." Fall back to the raw value and
// lazily re-encrypt it so the row self-heals on its next sync.
async function decryptApiKey(integration: { id: string; apiKey: string }): Promise<string> {
  try {
    return decrypt(integration.apiKey)
  } catch {
    console.warn(`[email-integration] ${integration.id} apiKey was not encrypted -- migrating to encrypted storage`)
    await prisma.emailIntegration.update({
      where: { id: integration.id },
      data: { apiKey: encrypt(integration.apiKey) },
    })
    return integration.apiKey
  }
}

export async function syncEmailIntegration(integrationId: string): Promise<{ synced: number }> {
  const integration = await prisma.emailIntegration.findUnique({
    where: { id: integrationId },
  })
  if (!integration?.isActive) return { synced: 0 }

  const apiKey = await decryptApiKey(integration)

  let campaigns: Awaited<ReturnType<typeof fetchKlaviyoCampaigns>> = []

  switch (integration.provider) {
    case 'KLAVIYO':
      campaigns = await fetchKlaviyoCampaigns(apiKey)
      break
    case 'MAILCHIMP':
      campaigns = await fetchMailchimpCampaigns(
        apiKey,
        integration.serverPrefix ?? 'us1'
      )
      break
    case 'CUSTOMER_IO':
      campaigns = await fetchCustomerioCampaigns(apiKey)
      break
  }

  for (const c of campaigns) {
    await prisma.emailCampaign.upsert({
      where: {
        integrationId_externalId: { integrationId, externalId: c.externalId },
      },
      update: {
        name: c.name,
        subject: c.subject,
        scheduledAt: c.scheduledAt,
        status: c.status,
        previewUrl: c.previewUrl,
        updatedAt: new Date(),
      },
      create: {
        integrationId,
        externalId: c.externalId,
        name: c.name,
        subject: c.subject,
        scheduledAt: c.scheduledAt,
        status: c.status,
        previewUrl: c.previewUrl,
      },
    })
  }

  await prisma.emailIntegration.update({
    where: { id: integrationId },
    data: { lastSyncAt: new Date() },
  })

  return { synced: campaigns.length }
}
