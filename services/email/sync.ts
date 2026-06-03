import { prisma } from '@/lib/prisma'
import { getProvider } from './provider-factory'
import type { EmailCampaignStatus } from '@prisma/client'

function mapStatus(raw: 'scheduled' | 'sent' | 'draft'): EmailCampaignStatus {
  switch (raw) {
    case 'scheduled': return 'SCHEDULED'
    case 'sent':      return 'SENT'
    default:          return 'DRAFT'
  }
}

export async function syncEmailCampaigns(workspaceId: string): Promise<void> {
  const connection = await prisma.emailConnection.findUnique({
    where: { workspaceId },
  })
  if (!connection || !connection.isActive) return

  try {
    const provider  = getProvider(connection)
    const campaigns = await provider.getCampaigns()

    await Promise.all(
      campaigns.map(raw =>
        prisma.emailCampaign.upsert({
          where: {
            emailConnectionId_externalId: {
              emailConnectionId: connection.id,
              externalId: raw.externalId,
            },
          },
          create: {
            emailConnectionId: connection.id,
            workspaceId,
            externalId:  raw.externalId,
            name:        raw.name,
            subjectLine: raw.subjectLine,
            status:      mapStatus(raw.status),
            scheduledAt: raw.scheduledAt,
            sentAt:      raw.sentAt,
          },
          update: {
            name:        raw.name,
            subjectLine: raw.subjectLine,
            status:      mapStatus(raw.status),
            scheduledAt: raw.scheduledAt,
            sentAt:      raw.sentAt,
            updatedAt:   new Date(),
          },
        })
      )
    )

    await prisma.emailConnection.update({
      where: { id: connection.id },
      data:  { lastSyncAt: new Date(), lastSyncError: null },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown sync error'
    await prisma.emailConnection.update({
      where: { id: connection.id },
      data:  { lastSyncError: message },
    })
    throw err
  }
}

// Process connections in batches to avoid exhausting the Prisma connection pool
// and provider rate limits when there are many active workspaces.
const SYNC_BATCH_SIZE = 5

export async function syncAllEmailCampaigns(): Promise<number> {
  const connections = await prisma.emailConnection.findMany({
    where:  { isActive: true },
    select: { workspaceId: true },
  })

  for (let i = 0; i < connections.length; i += SYNC_BATCH_SIZE) {
    const batch = connections.slice(i, i + SYNC_BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(c => syncEmailCampaigns(c.workspaceId))
    )
    results.forEach((r, j) => {
      if (r.status === 'rejected') {
        console.error(`[sync-email] workspace ${batch[j].workspaceId} failed:`, r.reason)
      }
    })
  }

  return connections.length
}
