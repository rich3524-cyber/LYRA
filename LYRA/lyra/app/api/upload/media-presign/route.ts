import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { s3 } from '@/lib/s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { randomUUID } from 'crypto'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { canWrite } from '@/lib/authz'

export const dynamic = 'force-dynamic'

const MAX_IMAGE_SIZE = 50 * 1024 * 1024 // 50 MB
// 200 MB, not the 25MB attach_media uses -- this route's backend involvement
// is just generating a presigned POST (near-instant), not fetching/buffering
// the actual file, so the Netlify-function-timeout constraint that caps
// attach_media's video size doesn't apply here. See the design spec
// (docs/superpowers/specs/2026-08-07-mcp-media-presigned-upload-design.md).
const MAX_VIDEO_SIZE = 200 * 1024 * 1024
// 10 minutes, longer than the web app's 5-minute presign default -- an LLM
// agent's render-then-upload loop has more inherent latency than a browser
// clicking upload immediately.
const EXPIRES_SECONDS = 600

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

    const { allowed } = await checkRateLimit(`upload-media-presign:${user.id}`, 20, 60)
    if (!allowed) return rateLimitResponse()

    const { workspaceId, contentType } = await req.json() as { workspaceId?: unknown; contentType?: unknown }

    if (!workspaceId || typeof workspaceId !== 'string') {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }
    if (!contentType || typeof contentType !== 'string') {
      return NextResponse.json({ error: 'contentType required' }, { status: 400 })
    }

    // Object.hasOwn, not a plain ALLOWED_MIME_TYPES[contentType] lookup -- a plain
    // object literal also resolves inherited Object.prototype members, so
    // contentType: "constructor" (or "__proto__", "toString", "valueOf",
    // "hasOwnProperty") would return a truthy value and sail past this check.
    const ext = Object.hasOwn(ALLOWED_MIME_TYPES, contentType) ? ALLOWED_MIME_TYPES[contentType] : undefined
    if (!ext) {
      return NextResponse.json({ error: 'File type not permitted' }, { status: 415 })
    }

    // contentType is entirely client-declared here -- unlike from-url, there's no
    // server-side fetch to independently observe a Content-Type header from. The S3
    // policy's `eq $Content-Type` condition only constrains the declared form field
    // at upload time; S3 never inspects the actual file bytes, so a client could
    // still declare image/jpeg and upload different bytes. This matches the same
    // trust model attach_media/from-url already accept (they also only ever
    // validate a declared Content-Type, never magic bytes) -- deliberate, not an
    // oversight.

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const maxSize = contentType.startsWith('video/') ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
    const s3Key = `media/${workspaceId}/${randomUUID()}.${ext}`
    const bucket = process.env.AWS_S3_BUCKET!

    const { url: uploadUrl, fields } = await createPresignedPost(s3, {
      Bucket: bucket,
      Key: s3Key,
      Conditions: [
        ['content-length-range', 1, maxSize],
        ['eq', '$Content-Type', contentType],
      ],
      Fields: {
        'Content-Type': contentType,
      },
      Expires: EXPIRES_SECONDS,
    })

    const region = process.env.S3_REGION ?? 'ap-southeast-2'
    const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`

    return NextResponse.json({ uploadUrl, fields, publicUrl })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/upload/media-presign error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
