import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWrite } from '@/lib/authz'
import { buildBulkImportTemplate } from '@/lib/xlsx-template'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id: workspaceId } = await params

    // Same role gate POST /api/posts uses -- this template is the entry point
    // to a post-creation flow, so read-only roles have no business downloading
    // a workspace-scoped one.
    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const socialAccounts = await prisma.socialAccount.findMany({
      where:  { workspaceId, isActive: true },
      select: { platform: true },
    })
    // Deduped: a workspace with two Facebook Pages must not get "FACEBOOK"
    // twice in the dropdown.
    const connectedPlatforms = [...new Set(socialAccounts.map((a) => a.platform))]

    const buffer = await buildBulkImportTemplate(connectedPlatforms)

    return new NextResponse(new Uint8Array(buffer), {
      status:  200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="lyra-bulk-import-template.xlsx"',
        // Generated per workspace from live account data -- a cached copy could
        // offer a platform that has since been disconnected.
        'Cache-Control':       'no-store',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/workspaces/[id]/bulk-import/template error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
