import { prisma } from '@/lib/prisma'
import { fetchKlaviyoCampaigns } from './klaviyo-campaigns'
import { fetchMailchimpCampaigns } from './mailchimp-campaigns'
import { fetchCustomerioCampaigns } from './customerio-campaigns'

export async function syncEmailIntegration(integrationId: string): Promise<{ synced: number }> {
  const integration = await prisma.emailIntegration.findUnique({
    where: { id: integrationId },
  })
  if (!integration?.isActive) return { synced: 0 }

  let campaigns: Awaited<ReturnType<typeof fetchKlaviyoCampaigns>> = []

  switch (integration.provider) {
    case 'KLAVIYO':
      campaigns = await fetchKlaviyoCampaigns(integration.apiKey)
      break
    case 'MAILCHIMP':
      campaigns = await fetchMailchimpCampaigns(
        integration.apiKey,
        integration.serverPrefix ?? 'us1'
      )
      break
    case 'CUSTOMER_IO':
      campaigns = await fetchCustomerioCampaigns(integration.apiKey)
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
