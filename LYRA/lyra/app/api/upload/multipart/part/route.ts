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

    if (!uploadId || typeof chunkIndex !== 'number' || chunkIndex < 0 || !data) {
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
    // S3 part numbers are 1-indexed; chunkIndex from the client is 0-indexed.
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
