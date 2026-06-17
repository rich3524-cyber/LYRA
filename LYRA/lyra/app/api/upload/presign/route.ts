import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getUploadPresignedUrl } from '@/lib/s3'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const BUCKET = process.env.AWS_S3_BUCKET!
const REGION = process.env.AWS_REGION ?? 'ap-southeast-2'

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

    const { filename: _filename, contentType, workspaceId } = await req.json() as {
      filename: string
      contentType: string
      workspaceId?: string
    }

    const ext = ALLOWED_MIME_TYPES[contentType]
    if (!ext) {
      return NextResponse.json({ error: 'File type not permitted' }, { status: 415 })
    }

    const folder = workspaceId ?? user.id
    const key = `media/${folder}/${randomUUID()}.${ext}`

    const presignedUrl = await getUploadPresignedUrl(key, contentType)
    const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`

    return NextResponse.json({ presignedUrl, publicUrl })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/upload/presign error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
