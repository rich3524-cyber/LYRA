import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { zernioClient, ZernioApiError } from '@/services/social/zernio-client'
import { ensureZernioProfile } from '@/services/social/zernio-connect'
import { toZernioPlatform } from '@/services/social/provider/platform-map'

export const dynamic = 'force-dynamic'

const BASE_URL = process.env.APP_BASE_URL!

export async function GET(
  req: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const user = await requireAuth()
    const { platform } = await params
    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const zernioPlatform = toZernioPlatform(platform)
    if (!zernioPlatform) {
      return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 })
    }

    // Cross-tenant guard: the connect route now mutates Workspace.zernioProfileId,
    // so (unlike the old native-only version) it needs an access check up front
    // rather than relying solely on the callback's check. Excludes CLIENT_VIEW --
    // this kicks off a real OAuth connect flow that can attach a new social
    // account to the workspace, not a read.
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
    })
    if (!workspace) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Lazy-create the Zernio profile for this workspace on first connect of any
    // platform. One profile per workspace, per the design (Profiles group
    // accounts the same way a LYRA Workspace does).
    const zernioProfileId = await ensureZernioProfile(workspaceId, workspace.name)

    const redirectUrl = `${BASE_URL}/api/zernio/connect/callback?workspaceId=${encodeURIComponent(workspaceId)}`
    const { authUrl } = await zernioClient.getConnectUrl(zernioPlatform, zernioProfileId, redirectUrl)

    return NextResponse.redirect(authUrl)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ZernioApiError) {
      console.error(`GET /api/social/connect/[platform] Zernio error (${error.status}):`, error.message)
      const status = error.status >= 400 && error.status < 500 ? error.status : 502
      return NextResponse.json({ error: error.message }, { status })
    }
    console.error(`GET /api/social/connect/[platform] error:`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
