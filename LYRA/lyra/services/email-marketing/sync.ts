import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { fetchKlaviyoCampaigns } from './klaviyo-campaigns'
import { fetchMailchimpCampaigns } from './mailchimp-campaigns'
import { fetchCustomerioCampaigns } from './customerio-campaigns'

export async function syncEmailIntegration(integrationId: string): Promise<{ synced: number }> {
  const integration = await prisma.emailIntegration.findUnique({
    where: { id: integrationId },
  })
  if (!integration?.isActive) return { synced: 0 }

  // Null once the integration has been disconnected -- the credential is
  // deleted rather than retained, so there is nothing to sync with. Not an
  // error: an inactive row is already skipped above, and this is the narrow
  // race where a disconnect lands between the two.
  if (!integration.apiKey) {
    console.warn(`[email-integration] ${integration.id} has no stored credential -- skipping sync`)
    return { synced: 0 }
  }

  // This used to catch decrypt()'s failure, treat it as "never encrypted",
  // use the raw value and lazily re-encrypt the row. That self-healing path is
  // deliberately gone. It only ever fired for rows predating encryption of
  // this field, and it fired on *sync*, so a row that never synced stayed
  // plaintext indefinitely -- which is exactly how both production keys were
  // still readable in November 2026, months after the field was encrypted and
  // while both were isActive: true. Masking a plaintext credential as a
  // warning let it persist unnoticed; now a value this key cannot decrypt is
  // an error, which is what control 05's fail-closed requirement asks for.
  //
  // decrypt() throws on anything it did not itself produce -- a malformed
  // iv+tag prefix, or GCM auth-tag verification failure -- so this also
  // surfaces an ENCRYPTION_KEY mismatch rather than silently re-encrypting
  // under the wrong key.
  let apiKey: string
  try {
    apiKey = decrypt(integration.apiKey)
  } catch {
    throw new Error(
      `EmailIntegration ${integration.id} (${integration.provider}) has a credential this ` +
      'ENCRYPTION_KEY cannot decrypt. It is either plaintext from before this field was ' +
      'encrypted, or encrypted under a different key. Reconnect the integration to re-store ' +
      'it; see LYRA-Data-Register.md section 5.4.'
    )
  }

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
