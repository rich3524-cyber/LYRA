import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { putObject, deleteObject } from '@/lib/s3'

const ALLOWED_TYPES = ['image/png', 'image/jpeg']
const MAX_SIZE = 2 * 1024 * 1024

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id: workspaceId } = await params

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true, clientLogoS3Key: true },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const formData = await req.formData()
    const entry = formData.get('logo')

    if (!(entry instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    const file = entry

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'File must be PNG, JPG, or SVG' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `File must be under ${MAX_SIZE / (1024 * 1024)}MB` }, { status: 400 })
    }

    const ext = file.type === 'image/svg+xml' ? 'svg' : file.type === 'image/png' ? 'png' : 'jpg'
    const s3Key = `workspace-logos/${workspaceId}/logo.${ext}`

    if (workspace.clientLogoS3Key && workspace.clientLogoS3Key !== s3Key) {
      await deleteObject(workspace.clientLogoS3Key).catch((e) => console.error('Logo S3 cleanup failed:', e))
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    await putObject(s3Key, buffer, file.type)

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { clientLogoS3Key: s3Key },
    })

    return NextResponse.json({ success: true, key: s3Key })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Logo upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id: workspaceId } = await params

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true, clientLogoS3Key: true },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (workspace.clientLogoS3Key) {
      await deleteObject(workspace.clientLogoS3Key).catch((e) => console.error('Logo S3 cleanup failed:', e))
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { clientLogoS3Key: null },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Logo delete error:', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
