import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUploadPresignedUrl } from '@/lib/s3'
import { randomUUID } from 'crypto'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { canWrite } from '@/lib/authz'

export const dynamic = 'force-dynamic'

const BUCKET = process.env.AWS_S3_BUCKET!
// S3_REGION, not AWS_REGION -- see lib/s3.ts for why (Netlify reserves the AWS_* names).
const REGION = process.env.S3_REGION ?? 'ap-southeast-2'

// Server-side enforcement of the same limit lib/upload-media.ts checks client-side --
// the client check alone is trivially bypassable (this route is the actual gate).
const MAX_SIZE = 50 * 1024 * 1024 // 50 MB

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

    const ext = ALLOWED_MIME_TYPES[contentType]
    if (!ext) {
      return NextResponse.json({ error: 'File type not permitted' }, { status: 415 })
    }

    if (typeof size === 'number' && size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 413 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access || !canWrite(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const key = `media/${workspaceId}/${randomUUID()}.${ext}`

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
