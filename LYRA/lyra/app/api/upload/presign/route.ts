import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { s3 } from '@/lib/s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { randomUUID } from 'crypto'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { canWrite } from '@/lib/authz'

export const dynamic = 'force-dynamic'

// Read inside the handler, not captured at module load, matching
// app/api/upload/media-presign/route.ts. A module-level `process.env` read is
// evaluated once at import, which makes the value unsettable from a test's
// beforeEach and is a foot-gun whenever a module is imported before the
// environment is fully populated.
// S3_REGION, not AWS_REGION -- see lib/s3.ts for why (Netlify reserves the AWS_* names).
function s3Target() {
  return {
    bucket: process.env.AWS_S3_BUCKET!,
    region: process.env.S3_REGION ?? 'ap-southeast-2',
  }
}

// Server-side enforcement of the same limit lib/upload-media.ts checks
// client-side -- the client check alone is trivially bypassable.
//
// This is now enforced by S3 itself, via the presigned POST policy's
// content-length-range condition below, rather than by trusting the `size`
// the client reports. The previous version presigned a plain PUT and checked
// `typeof size === 'number' && size > MAX_SIZE`, which left two holes: a
// caller that simply omitted `size` skipped the check altogether, and even a
// caller that sent an honest size could then PUT a file of any length,
// because nothing in the presigned PUT constrained it. Control 05 of the ITWM
// security framework requires size to be validated at the trust boundary.
const MAX_SIZE = 50 * 1024 * 1024 // 50 MB
// Same 5-minute window the removed presigned-PUT helper used, so the client's
// upload deadline is unchanged by the move to a presigned POST.
const EXPIRES_SECONDS = 300

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

    const { allowed } = await checkRateLimit(`upload-presign:${user.id}`, 30, 60)
    if (!allowed) return rateLimitResponse()

    const { filename: _filename, contentType, size, workspaceId } = await req.json() as {
      filename: string
      contentType: string
      size?: number
      workspaceId?: string
    }

    // workspaceId used to be optional, which meant the tenant check below was
    // skipped entirely whenever a caller omitted it -- any authenticated user
    // could presign an upload with no workspace-access check at all. The one
    // real caller (lib/upload-media.ts) always sends workspaceId, so requiring
    // it here doesn't change legitimate behavior.
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    // Object.hasOwn, not a plain ALLOWED_MIME_TYPES[contentType] lookup -- a
    // plain object literal also resolves inherited Object.prototype members,
    // so contentType: "constructor" (or "__proto__", "toString", "valueOf",
    // "hasOwnProperty") returns a truthy value and sails past this check.
    // app/api/upload/media-presign/route.ts already guards this; this route
    // did not.
    const ext = Object.hasOwn(ALLOWED_MIME_TYPES, contentType) ? ALLOWED_MIME_TYPES[contentType] : undefined
    if (!ext) {
      return NextResponse.json({ error: 'File type not permitted' }, { status: 415 })
    }

    // Fail fast on an honestly-reported oversized file so the user gets a
    // clear 413 instead of an opaque S3 policy rejection mid-upload. This is
    // a convenience, NOT the gate -- the content-length-range condition below
    // is what actually enforces the limit, and it holds even when `size` is
    // absent or a lie.
    if (size !== undefined && (typeof size !== 'number' || !Number.isFinite(size) || size > MAX_SIZE)) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 413 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const key = `media/${workspaceId}/${randomUUID()}.${ext}`

    // Presigned POST rather than PUT: only the POST policy can carry
    // conditions S3 enforces at upload time. content-length-range caps the
    // body at MAX_SIZE (and requires at least 1 byte), and the Content-Type
    // equality condition stops a caller presigning as image/png and then
    // declaring something else on the upload itself. Mirrors
    // app/api/upload/media-presign/route.ts, which already did this.
    //
    // Note what this still does not do: S3 never inspects the file bytes, so
    // a caller can declare image/jpeg and upload other content. Magic-byte
    // validation and malware scanning (control 05, mandatory for Tier C)
    // remain outstanding and are tracked separately -- this change closes the
    // size hole only.
    const { bucket, region } = s3Target()

    const { url: uploadUrl, fields } = await createPresignedPost(s3, {
      Bucket: bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, MAX_SIZE],
        ['eq', '$Content-Type', contentType],
      ],
      Fields: { 'Content-Type': contentType },
      Expires: EXPIRES_SECONDS,
    })

    const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`

    return NextResponse.json({ uploadUrl, fields, publicUrl })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/upload/presign error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
