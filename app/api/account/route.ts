import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE() {
  try {
    const user = await requireAuth()

    // Only delete workspaces this user actually OWNS (admin/SMB owner roles).
    // Members and clients with VIEW/APPROVE access should not trigger workspace deletion.
    const ownedRoles = ['AGENCY_ADMIN', 'SMB_OWNER', 'PLATFORM_OWNER']
    const workspaceIds = user.workspaceAccess
      .filter(wa => ownedRoles.includes(wa.role))
      .map(wa => wa.workspaceId)

    // Schema-level onDelete: Cascade handles all child records when workspace is deleted.
    // Remove membership from workspaces the user doesn't own before deleting their account.
    await prisma.$transaction([
      prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } }),
      prisma.workspaceAccess.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ])

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('DELETE /api/account error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
