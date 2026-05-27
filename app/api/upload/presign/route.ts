import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getUploadPresignedUrl } from '@/lib/s3'

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]

export async function POST(req: Request) {
  try {
    await requireAuth()

    const { filename, contentType } = await req.json() as {
      filename: string
      contentType: string
    }

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'filename and contentType required' },
        { status: 400 }
      )
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: 'File type not allowed' },
        { status: 400 }
      )
    }

    const ext          = filename.split('.').pop() ?? 'bin'
    const key          = `media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const presignedUrl = await getUploadPresignedUrl(key, contentType)
    const publicUrl    = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION ?? 'ap-southeast-2'}.amazonaws.com/${key}`

    return NextResponse.json({ presignedUrl, publicUrl })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/upload/presign error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
