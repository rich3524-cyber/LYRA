import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWrite } from '@/lib/authz'
import { parseBulkImportFile } from '@/lib/xlsx-parser'
import { validateImportRows } from '@/services/posts/bulk-import'
import { BULK_IMPORT_MAX_DATA_ROWS } from '@/lib/xlsx-template'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// A filled-in 500-row template is well under a megabyte. This ceiling exists so
// a wrong or hostile upload is rejected before it is buffered into memory
// inside a serverless function, not to police realistic imports.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id: workspaceId } = await params

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Every row with a Media URL gets a real safeFetch HEAD request during
    // validation below (up to BULK_IMPORT_MAX_DATA_ROWS of them) -- an
    // uncapped route accepting file uploads AND fanning out external
    // requests is exactly the class this app already rate-limits everywhere
    // else (uploads, AI generation, reports).
    const { allowed } = await checkRateLimit(`bulk-import-parse:${user.id}`, 10, 60)
    if (!allowed) return rateLimitResponse()

    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'That file is too large to be a bulk-import template.' },
        { status: 413 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    let rawRows
    try {
      rawRows = await parseBulkImportFile(buffer)
    } catch {
      // exceljs throws on anything that isn't a readable xlsx (a .csv renamed,
      // a corrupt download). That's a user-fixable problem, not a 500.
      return NextResponse.json(
        { error: 'That file could not be read as an .xlsx spreadsheet. Download a fresh template and try again.' },
        { status: 422 }
      )
    }

    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: 'No rows found. Fill in the template below the header row before uploading.' },
        { status: 422 }
      )
    }
    if (rawRows.length > BULK_IMPORT_MAX_DATA_ROWS) {
      return NextResponse.json(
        { error: `This file has ${rawRows.length} rows; the limit is ${BULK_IMPORT_MAX_DATA_ROWS} per import.` },
        { status: 422 }
      )
    }

    const [workspace, socialAccounts] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } }),
      prisma.socialAccount.findMany({
        where:   { workspaceId, isActive: true },
        select:  { id: true, platform: true },
        // Stable order: validateImportRow takes the first account matching a
        // row's platform, so an unordered query would make which Page a row
        // targets vary between requests.
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const results = await validateImportRows(rawRows, socialAccounts, workspace?.timezone ?? 'UTC')

    return NextResponse.json({ rows: results })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/workspaces/[id]/bulk-import/parse error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
