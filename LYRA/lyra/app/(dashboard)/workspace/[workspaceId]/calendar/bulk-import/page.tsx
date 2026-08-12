import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWrite } from '@/lib/authz'
import { BulkImportClient } from '@/components/lyra/calendar/bulk-import-client'

interface Props {
  params: Promise<{ workspaceId: string }>
}

// Server component so the access check, the role gate, and the workspace
// timezone are resolved before any of the page renders -- a read-only role
// should never see an import screen whose every action would 403, and the
// review table needs the workspace timezone to echo back the times the user
// actually typed into the spreadsheet.
export default async function BulkImportPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where:  { id: workspaceId, access: { some: { userId: user.id } } },
    select: {
      id:             true,
      timezone:       true,
      access:         { where: { userId: user.id }, select: { role: true } },
      socialAccounts: { where: { isActive: true }, select: { id: true }, take: 1 },
    },
  })

  if (!workspace) notFound()

  const role = workspace.access[0]?.role
  // Same gate the three bulk-import routes apply. Without it a CLIENT_VIEW
  // user would get a working-looking page where every button fails.
  if (!role || !canWrite(role)) notFound()

  return (
    <BulkImportClient
      workspaceId={workspace.id}
      timeZone={workspace.timezone}
      hasConnectedAccounts={workspace.socialAccounts.length > 0}
    />
  )
}
