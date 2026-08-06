import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createMultipartUpload, abortMultipartUpload } from '@/lib/s3'
import { createUploadSession } from '@/lib/upload-session'
import { randomUUID } from 'crypto'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { canWrite } from '@/lib/authz'

export const dynamic = 'force-dynamic'

const MAX_IMAGE_SIZE = 50 * 1024 * 1024 // 50 MB, matches the existing presign route's limit
const MAX_VIDEO_SIZE = 200 * 1024 * 1024 // 200 MB
const CHUNK_SIZE_BYTES = 6 * 1024 * 1024 // 6 MB -- comfortably above S3's 5MB-per-part minimum

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

    const { allowed } = await checkRateLimit(`upload-multipart-start:${user.id}`, 30, 60)
    if (!allowed) return rateLimitResponse()

    const { workspaceId, contentType, totalSizeBytes } = await req.json() as {
      workspaceId?: string
      filename?: string
      contentType: string
      totalSizeBytes: number
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    // Object.hasOwn, not a plain ALLOWED_MIME_TYPES[contentType] lookup -- a plain
    // object literal also resolves inherited Object.prototype members, so
    // contentType: "constructor" (or "__proto__", "toString", "valueOf",
    // "hasOwnProperty") would return a truthy value and sail past this check.
    const ext = Object.hasOwn(ALLOWED_MIME_TYPES, contentType) ? ALLOWED_MIME_TYPES[contentType] : undefined
    if (!ext) {
      return NextResponse.json({ error: 'File type not permitted' }, { status: 415 })
    }

    const maxSize = contentType.startsWith('video/') ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
    if (typeof totalSizeBytes !== 'number' || totalSizeBytes <= 0) {
      return NextResponse.json({ error: 'totalSizeBytes must be a positive number' }, { status: 400 })
    }
    if (totalSizeBytes > maxSize) {
      return NextResponse.json({ error: `File too large (max ${maxSize / (1024 * 1024)}MB)` }, { status: 413 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const s3Key = `media/${workspaceId}/${randomUUID()}.${ext}`
    const s3UploadId = await createMultipartUpload(s3Key, contentType)
    const expectedParts = Math.ceil(totalSizeBytes / CHUNK_SIZE_BYTES)
    const uploadId = randomUUID()

    try {
      await createUploadSession(uploadId, {
        s3Key,
        s3UploadId,
        workspaceId,
        userId: user.id,
        contentType,
        totalSizeBytes,
        chunkSizeBytes: CHUNK_SIZE_BYTES,
        expectedParts,
      })
    } catch (sessionError) {
      // Same "never let a cleanup failure mask the real error" pattern already
      // used in the completion route -- an orphaned zero-byte S3 multipart
      // upload costs almost nothing, but there's no reason not to clean it up
      // immediately when we can, rather than waiting on Task 13's not-yet-configured
      // bucket lifecycle rule.
      await abortMultipartUpload(s3Key, s3UploadId).catch(() => {})
      throw sessionError
    }

    return NextResponse.json({ uploadId, chunkSizeBytes: CHUNK_SIZE_BYTES })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/upload/multipart/start error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
