import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { completeMultipartUpload, abortMultipartUpload } from '@/lib/s3'
import { getUploadSessionMeta, getReceivedParts, deleteUploadSession } from '@/lib/upload-session'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    const { allowed } = await checkRateLimit(`upload-multipart-complete:${user.id}`, 30, 60)
    if (!allowed) return rateLimitResponse()

    const { uploadId } = (await req.json()) as { uploadId?: string }
    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId required' }, { status: 400 })
    }

    const session = await getUploadSessionMeta(uploadId)
    if (!session) {
      return NextResponse.json({ error: 'Upload session not found or expired' }, { status: 404 })
    }
    if (session.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const receivedParts = await getReceivedParts(uploadId)
    const missing: number[] = []
    for (let i = 0; i < session.expectedParts; i++) {
      if (!(i in receivedParts)) missing.push(i)
    }
    if (missing.length > 0) {
      return NextResponse.json({ error: `Missing chunks: ${missing.join(', ')}` }, { status: 422 })
    }

    const parts = Object.entries(receivedParts)
      .map(([chunkIndex, etag]) => ({ partNumber: Number(chunkIndex) + 1, etag }))
      .sort((a, b) => a.partNumber - b.partNumber)

    try {
      await completeMultipartUpload(session.s3Key, session.s3UploadId, parts)
    } catch (completeError) {
      // Clean up eagerly rather than leaving this multipart upload for the
      // bucket's 3-day AbortIncompleteMultipartUpload lifecycle rule (Task 13)
      // to reclaim -- but never let an abort failure mask the real error.
      try {
        await abortMultipartUpload(session.s3Key, session.s3UploadId)
      } catch (abortError) {
        console.error('POST /api/upload/multipart/complete: abort-after-failure also failed:', abortError)
      }
      throw completeError
    }

    await deleteUploadSession(uploadId)

    const bucket = process.env.AWS_S3_BUCKET!
    const region = process.env.S3_REGION ?? 'ap-southeast-2'
    const url = `https://${bucket}.s3.${region}.amazonaws.com/${session.s3Key}`

    return NextResponse.json({ url })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/upload/multipart/complete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
