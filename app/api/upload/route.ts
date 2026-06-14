import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'


const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const BUCKET = process.env.AWS_S3_BUCKET!
const MAX_SIZE = 50 * 1024 * 1024 // 50 MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const workspaceId = formData.get('workspaceId') as string | null

    if (!file || !workspaceId) {
      return NextResponse.json({ error: 'file and workspaceId required' }, { status: 400 })
    }

    // Verify the user has access to the target workspace
    const access = await prisma.workspaceAccess.findFirst({
      where: { workspaceId, userId: user.id },
    })
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 413 })
    }

    const allowedExt = ALLOWED_MIME_TYPES[file.type]
    if (!allowedExt) {
      return NextResponse.json({ error: 'File type not permitted' }, { status: 415 })
    }

    const key = `media/${workspaceId}/${user.id}/${randomUUID()}.${allowedExt}`

    const buffer = Buffer.from(await file.arrayBuffer())

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    )

    const url = `https://${BUCKET}.s3.${process.env.AWS_REGION ?? 'ap-southeast-2'}.amazonaws.com/${key}`

    return NextResponse.json({ url })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
