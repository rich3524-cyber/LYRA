import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUploadPresignedUrl } from '@/lib/s3'

const ALLOWED_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, filename, contentType } = await req.json()

    if (!workspaceId || !filename || !contentType) {
      return NextResponse.json({ error: 'workspaceId, filename and contentType required' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json({ error: 'File type not allowed. Use PDF, TXT, or DOCX.' }, { status: 400 })
    }

    const access = await prisma.workspaceAccess.findFirst({ where: { workspaceId, userId: user.id } })
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
    const key          = `guidelines/${workspaceId}/${Date.now()}-${safeFilename}`
    const uploadUrl    = await getUploadPresignedUrl(key, contentType)

    return NextResponse.json({ uploadUrl, key })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/brand-intelligence/guidelines/presigned error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
