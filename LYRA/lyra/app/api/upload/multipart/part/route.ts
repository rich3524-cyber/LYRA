import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { uploadPart } from '@/lib/s3'
import { getUploadSessionMeta, recordPart } from '@/lib/upload-session'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function PUT(req: Request) {
  try {
    const user = await requireAuth()

    // Higher limit than the start/complete routes -- a single large video
    // upload can legitimately require 30+ chunk calls (e.g. a 200MB video
    // at 6MB chunks is ~34 calls), all from one client in quick succession.
    const { allowed } = await checkRateLimit(`upload-multipart-part:${user.id}`, 120, 60)
    if (!allowed) return rateLimitResponse()

    const { uploadId, chunkIndex, data } = (await req.json()) as {
      uploadId?: string
      chunkIndex?: number
      data?: string
    }

    if (
      !uploadId ||
      typeof chunkIndex !== 'number' ||
      !Number.isInteger(chunkIndex) ||
      chunkIndex < 0 ||
      !data
    ) {
      return NextResponse.json({ error: 'uploadId, chunkIndex, and data are required' }, { status: 400 })
    }

    const session = await getUploadSessionMeta(uploadId)
    if (!session) {
      return NextResponse.json({ error: 'Upload session not found or expired' }, { status: 404 })
    }
    if (session.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (chunkIndex >= session.expectedParts) {
      return NextResponse.json(
        { error: `chunkIndex out of range (expected 0-${session.expectedParts - 1})` },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(data, 'base64')

    // Buffer.from(..., 'base64') is lenient in Node -- invalid/truncated
    // base64 silently decodes to a shorter-than-intended buffer rather than
    // throwing. A too-small non-final part gets caught later by S3's
    // 5MB-minimum-per-part rule at CompleteMultipartUpload time, but S3 does
    // NOT enforce a minimum size on the last part -- so a corrupted/truncated
    // final chunk would otherwise upload, record, and complete successfully
    // with the final object silently shorter than intended. Checking the
    // decoded length against the session's known chunk geometry here also
    // catches any oversized chunk before it reaches S3.
    const isLastChunk = chunkIndex === session.expectedParts - 1
    const expectedSize = isLastChunk
      ? session.totalSizeBytes - session.chunkSizeBytes * (session.expectedParts - 1)
      : session.chunkSizeBytes
    if (buffer.length !== expectedSize) {
      return NextResponse.json(
        { error: `chunk size mismatch: expected ${expectedSize} bytes, got ${buffer.length}` },
        { status: 400 }
      )
    }

    // S3 part numbers are 1-indexed; chunkIndex from the client is 0-indexed.
    //
    // No S3-succeeds-Redis-fails cleanup here, unlike /start's abort-on-failure
    // pattern -- if uploadPart (S3) succeeds but recordPart (Redis) then
    // throws, the client still holds a valid uploadId and simply retries the
    // same chunkIndex. UploadPart is idempotent per part number, so the retry
    // re-uploads that S3 part (overwriting the orphaned one) and succeeds
    // cleanly -- no orphaned state to clean up.
    const etag = await uploadPart(session.s3Key, session.s3UploadId, chunkIndex + 1, buffer)
    await recordPart(uploadId, chunkIndex, etag)

    return NextResponse.json({ received: true, chunkIndex })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('PUT /api/upload/multipart/part error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
