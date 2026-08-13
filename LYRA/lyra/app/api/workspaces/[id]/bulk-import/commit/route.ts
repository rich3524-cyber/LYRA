import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWrite } from '@/lib/authz'
import { safeFetch } from '@/lib/safe-fetch'
import { putObjectBuffer } from '@/lib/s3'
import { BULK_IMPORT_MAX_DATA_ROWS } from '@/lib/xlsx-template'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { mapWithConcurrency } from '@/lib/concurrency'
import { resolveCreateStatus } from '@/services/posts/post-lifecycle'
import { buildApprovalCreateInput } from '@/services/posts/post-approval-bookkeeping'

export const dynamic = 'force-dynamic'

// Matches the cap every other upload path in the app already enforces
// (upload/presign, upload/route, lib/upload-media.ts) -- this was the one
// media path that didn't, letting an attacker point rows at multi-gigabyte
// responses.
const MAX_MEDIA_BYTES = 50 * 1024 * 1024
// Up to BULK_IMPORT_MAX_DATA_ROWS (500) rows can carry a mediaUrl; firing all
// of them at once is a real OOM/socket-exhaustion risk, not just theoretical.
const MEDIA_FETCH_CONCURRENCY = 8
const MAX_CONTENT_LENGTH = 5000

interface CommitRow {
  socialAccountId: string
  content: string
  scheduledAt: string
  mediaUrl: string | null
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/jpg':       'jpg',
  'image/png':       'png',
  'image/gif':       'gif',
  'image/webp':      'webp',
  'video/mp4':       'mp4',
  'video/quicktime': 'mov',
  'video/webm':      'webm',
}

/**
 * Fetches and re-hosts one row's media URL to S3, mirroring the key pattern
 * app/api/upload/media-presign/route.ts uses for browser uploads.
 *
 * Returns null on any failure. A link that died in the gap between the
 * parse-time HEAD check and the user clicking Import must degrade to "post
 * without media" -- failing the whole row this late would discard a caption
 * the user has already reviewed and approved.
 */
async function rehostMedia(workspaceId: string, url: string): Promise<string | null> {
  try {
    const res = await safeFetch(url)
    if (!res.ok) return null

    // Content-Type can carry parameters ("image/png; charset=binary"); match
    // on the media type alone.
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const ext = EXT_BY_CONTENT_TYPE[contentType]
    if (!ext) return null

    const declaredLength = Number(res.headers.get('content-length') ?? NaN)
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES) return null

    // Enforce the cap by reading the stream ourselves rather than trusting
    // Content-Length (absent or lying), since the whole point is bounding
    // memory use regardless of what the remote host claims.
    const reader = res.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_MEDIA_BYTES) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
    const buffer = Buffer.concat(chunks)
    const key = `media/${workspaceId}/${randomUUID()}.${ext}`
    await putObjectBuffer(key, buffer, contentType)

    const bucket = process.env.AWS_S3_BUCKET!
    const region = process.env.S3_REGION ?? 'ap-southeast-2'
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
  } catch {
    return null
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id: workspaceId } = await params

    const access = await prisma.workspaceAccess.findFirst({
      where:   { workspaceId, userId: user.id },
      include: { workspace: { select: { clientAccessLevel: true } } },
    })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // The most expensive route in this feature: every row with a mediaUrl
    // triggers a real external fetch and an S3 write, and one call can carry
    // up to BULK_IMPORT_MAX_DATA_ROWS of them. Tighter than the parse route
    // for that reason -- a real import happens rarely, not many times a minute.
    const { allowed } = await checkRateLimit(`bulk-import-commit:${user.id}`, 5, 300)
    if (!allowed) return rateLimitResponse()

    const { rows } = (await req.json().catch(() => ({}))) as { rows?: CommitRow[] }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows is required and must be non-empty' }, { status: 400 })
    }
    if (rows.length > BULK_IMPORT_MAX_DATA_ROWS) {
      return NextResponse.json(
        { error: `A single import is limited to ${BULK_IMPORT_MAX_DATA_ROWS} posts.` },
        { status: 422 }
      )
    }

    // The review screen only ever sends well-formed rows, but this route has
    // no way to tell a real review-screen submission from a hand-crafted
    // request to the same endpoint -- shape must be re-checked server-side,
    // not just account ownership. Without this, a malformed scheduledAt would
    // reach `new Date(...)` as Invalid Date, which Prisma rejects, failing
    // the whole $transaction (and every other row in the same batch) with a
    // generic 500 instead of naming the actual bad row.
    const badRow = rows.find(
      (row) =>
        typeof row.content !== 'string' ||
        row.content.trim().length === 0 ||
        row.content.length > MAX_CONTENT_LENGTH ||
        typeof row.scheduledAt !== 'string' ||
        Number.isNaN(new Date(row.scheduledAt).getTime())
    )
    if (badRow) {
      return NextResponse.json(
        { error: 'One or more rows have empty, oversized content or an invalid scheduledAt.' },
        { status: 400 }
      )
    }

    // The client posts back the rows it was given, so socialAccountId is
    // caller-supplied and must be re-checked against this workspace. Without
    // this, a crafted request could attach posts to another tenant's account.
    const ownedAccounts = await prisma.socialAccount.findMany({
      where:  { workspaceId, isActive: true },
      select: { id: true },
    })
    const ownedIds = new Set(ownedAccounts.map((a) => a.id))
    if (rows.some((row) => !ownedIds.has(row.socialAccountId))) {
      return NextResponse.json(
        { error: 'One or more rows reference an account that is not connected to this workspace.' },
        { status: 400 }
      )
    }

    // Same approval-routing rule POST /api/posts already applies -- a bulk
    // import must not bypass client approval just because it arrived as a
    // batch instead of individual composer submissions. Every bulk-imported
    // row is conceptually a SCHEDULED request; bulk import has no draft path.
    const finalStatus = resolveCreateStatus('SCHEDULED', access.workspace.clientAccessLevel)

    // Media re-hosting runs before the transaction, not inside it. An external
    // fetch can take seconds and Prisma's transactions hold a DB connection
    // open for their whole duration -- doing this inline would tie up one
    // connection per row while waiting on the network.
    const rehosted = await mapWithConcurrency(rows, MEDIA_FETCH_CONCURRENCY, (row) =>
      row.mediaUrl ? rehostMedia(workspaceId, row.mediaUrl) : Promise.resolve(null)
    )

    // A post created straight into PENDING_APPROVAL needs its PostApproval row
    // here -- the SLA cron filters on the related approval row, so without one
    // an imported post is invisible to approval-overdue alerting. Same fix as
    // POST /api/posts, which had the identical gap.
    const submittedAt = new Date()
    const approvalCreate = buildApprovalCreateInput(finalStatus, submittedAt)

    const posts = await prisma.$transaction(
      rows.map((row, i) =>
        prisma.post.create({
          data: {
            workspaceId,
            socialAccountId: row.socialAccountId,
            authorId:        user.id,
            content:         row.content,
            mediaUrls:       rehosted[i] ? [rehosted[i]!] : [],
            status:          finalStatus,
            scheduledAt:     new Date(row.scheduledAt),
            ...approvalCreate,
          },
        })
      )
    )

    return NextResponse.json({ created: posts.length, posts })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/workspaces/[id]/bulk-import/commit error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
