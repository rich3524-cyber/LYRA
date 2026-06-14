import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'


export async function GET() {
  try {
    const user = await requireAuth()
    const workspaces = await prisma.workspace.findMany({
      where: {
        access: { some: { userId: user.id } },
      },
      select: {
        id: true,
        name: true,
        industry: true,
        clientAccessLevel: true,
        aiResponseMode: true,
        plan: true,
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(workspaces)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('GET /api/workspaces error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { name, industry, websiteUrl, clientAccessLevel } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        industry,
        websiteUrl,
        agencyId:          user.agencyId ?? undefined,
        clientAccessLevel: clientAccessLevel ?? 'NONE',
        access: {
          create: { userId: user.id, role: 'AGENCY_ADMIN' },
        },
      },
    })

    return NextResponse.json(workspace, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('POST /api/workspaces error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
