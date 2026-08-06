import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { putObjectBuffer } from '@/lib/s3'
import { safeFetch } from '@/lib/safe-fetch'
import { randomUUID } from 'crypto'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { canWrite } from '@/lib/authz'

export const dynamic = 'force-dynamic'

const MAX_IMAGE_SIZE = 50 * 1024 * 1024 // 50 MB, matches the old multipart start route's image limit
// 25 MB, not 200MB -- fetch + S3 PUT must both complete inside a single
// synchronous Netlify Function invocation (~10-26s), unlike the removed
// multipart route's chunked-across-many-requests approach. See the design
// spec (docs/superpowers/specs/2026-08-07-mcp-media-attach-redesign-design.md)
// for the full rationale.
const MAX_VIDEO_SIZE = 25 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/gif':       'gif',
  'image/webp':      'webp',
  'video/mp4':       'mp4',
  'video/quicktime': 'mov',
  'video/webm':      'webm',
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    const { allowed } = await checkRateLimit(`upload-from-url:${user.id}`, 20, 60)
    if (!allowed) return rateLimitResponse()

    const { workspaceId, sourceUrl } = await req.json() as { workspaceId?: string; sourceUrl?: string }

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }
    if (!sourceUrl) {
      return NextResponse.json({ error: 'sourceUrl required' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let res: Response
    try {
      res = await safeFetch(sourceUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        return NextResponse.json({ error: 'Timed out fetching sourceUrl' }, { status: 504 })
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Invalid or unsafe sourceUrl' },
        { status: 400 }
      )
    }

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch sourceUrl: ${res.status}` }, { status: 502 })
    }

    const contentType = res.headers.get('content-type')?.split(';')[0].trim() ?? ''
    // Object.hasOwn, not a plain ALLOWED_MIME_TYPES[contentType] lookup -- a plain
    // object literal also resolves inherited Object.prototype members, so
    // contentType: "constructor" (or "__proto__", "toString", "valueOf",
    // "hasOwnProperty") would return a truthy value and sail past this check.
    const ext = Object.hasOwn(ALLOWED_MIME_TYPES, contentType) ? ALLOWED_MIME_TYPES[contentType] : undefined
    if (!ext) {
      return NextResponse.json({ error: 'File type not permitted' }, { status: 415 })
    }

    const maxSize = contentType.startsWith('video/') ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE

    const contentLength = Number(res.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxSize) {
      return NextResponse.json({ error: `File too large (max ${maxSize / (1024 * 1024)}MB)` }, { status: 413 })
    }

    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    // Content-Length can't be trusted alone -- a misconfigured or malicious
    // server could omit it or under-report it, so the actual byte count is
    // checked again after the body is fully read.
    if (buffer.byteLength > maxSize) {
      return NextResponse.json({ error: `File too large (max ${maxSize / (1024 * 1024)}MB)` }, { status: 413 })
    }

    const s3Key = `media/${workspaceId}/${randomUUID()}.${ext}`
    await putObjectBuffer(s3Key, buffer, contentType)

    const bucket = process.env.AWS_S3_BUCKET!
    const region = process.env.S3_REGION ?? 'ap-southeast-2'
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`

    return NextResponse.json({ url })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/upload/from-url error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
