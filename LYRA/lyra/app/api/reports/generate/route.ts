import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateNarrative } from '@/services/reports/narrative-generator'
import { renderReport, ReportData } from '@/services/reports/report-renderer'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { getCachedBuffer, setCachedBuffer } from '@/lib/cache'

// Short TTL cache for the rendered PDF -- this route re-queries the full
// post history for the period, makes an LLM call for the narrative, and
// renders a PDF via headless Chromium on every request, none of which is
// cheap. 120s (vs. 60s on /api/analytics) since this is a heavier pipeline
// and reports are explicitly framed as not needing to be second-fresh.
// Cached bytes are the PDF body only -- the Content-Disposition filename is
// rebuilt fresh on every response (see below) so a cache hit never serves a
// stale-looking download timestamp.
const REPORT_CACHE_TTL_SECONDS = 120

function pdfResponse(period: '7d' | '30d', buffer: Buffer): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="lyra-report-${period}-${Date.now()}.pdf"`,
    },
  })
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth()

    // AI narrative generation + PDF rendering per call -- costly enough to
    // warrant a real ceiling, not the bare 20/min single-LLM-call default.
    const { allowed } = await checkRateLimit(`reports-generate:${user.id}`, 10, 300)
    if (!allowed) return rateLimitResponse()

    const body = await req.json().catch(() => null)
    const workspaceId = body?.workspaceId as unknown
    const period = body?.period as unknown
    if (typeof workspaceId !== 'string' || (period !== '7d' && period !== '30d')) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }
    const validPeriod = period as '7d' | '30d'

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id, role: { not: 'CLIENT_VIEW' } } } },
      select: { id: true, name: true, plan: true },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Reports require PRO or AGENCY plan.' }, { status: 403 })
    }

    // Cache key must be scoped to every input that changes the rendered PDF:
    // workspaceId (a collision here would hand one customer's report PDF --
    // narrative, metrics, everything -- to another customer) and period,
    // the only other request-varying input this route takes. Auth, rate
    // limiting, and the workspace/plan checks above always run for real on
    // every request, cache hit or not -- only the expensive query+LLM+PDF
    // pipeline below is cached.
    const cacheKey = `report-pdf:${workspaceId}:${validPeriod}`
    const cachedPdf = await getCachedBuffer(cacheKey)
    if (cachedPdf) return pdfResponse(validPeriod, cachedPdf)

    const days = validPeriod === '7d' ? 7 : 30
    const periodStart = new Date()
    periodStart.setDate(periodStart.getDate() - days)

    const posts = await prisma.post.findMany({
      where: {
        workspaceId,
        status: 'PUBLISHED',
        publishedAt: { gte: periodStart },
      },
      include: {
        metrics: true,
        socialAccount: { select: { platform: true } },
      },
      orderBy: { publishedAt: 'desc' },
    })

    // Engagements are derived from likes + comments + shares (no single engagements field).
    const engagementsOf = (m: { likes: number; comments: number; shares: number } | null) =>
      m ? m.likes + m.comments + m.shares : 0

    // Build platform stats
    const platformMap: Record<string, { posts: number; impressions: number; engagements: number }> = {}
    for (const post of posts) {
      if (!post.metrics) continue
      const p = post.socialAccount?.platform ?? 'UNKNOWN'
      if (!platformMap[p]) platformMap[p] = { posts: 0, impressions: 0, engagements: 0 }
      platformMap[p].posts++
      platformMap[p].impressions += post.metrics.impressions ?? 0
      platformMap[p].engagements += engagementsOf(post.metrics)
    }

    const platforms = Object.entries(platformMap).map(([platform, s]) => ({
      platform,
      posts: s.posts,
      impressions: s.impressions,
      engagements: s.engagements,
      engRate: s.impressions > 0 ? (s.engagements / s.impressions) * 100 : 0,
    }))

    const totalImpressions = platforms.reduce((sum, p) => sum + p.impressions, 0)
    const totalEngagements = platforms.reduce((sum, p) => sum + p.engagements, 0)
    const bestPlatform = platforms.sort((a, b) => b.engagements - a.engagements)[0]?.platform ?? 'N/A'
    const avgEngRate = totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0

    const topPosts = posts
      .filter((p) => p.metrics)
      .sort((a, b) => engagementsOf(b.metrics) - engagementsOf(a.metrics))
      .slice(0, 3)
      .map((p) => ({
        platform: p.socialAccount?.platform ?? 'UNKNOWN',
        scheduledAt: p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : '',
        contentExcerpt: (p.content ?? '').slice(0, 120),
        impressions: p.metrics!.impressions ?? 0,
        engagements: engagementsOf(p.metrics),
      }))

    if (posts.length === 0) {
      return NextResponse.json({ error: 'No published posts in the selected period.' }, { status: 422 })
    }

    const reportDataWithoutNarrative = {
      workspaceName: workspace.name,
      period: validPeriod,
      generatedAt: new Date().toLocaleDateString(),
      summary: { totalPosts: posts.length, totalImpressions, totalEngagements, avgEngRate, bestPlatform },
      platforms,
      topPosts,
      narrative: '',
    }

    const narrative = await generateNarrative(reportDataWithoutNarrative)
    const reportData: ReportData = { ...reportDataWithoutNarrative, narrative }

    const pdfBuffer = await renderReport(reportData)

    await setCachedBuffer(cacheKey, pdfBuffer, REPORT_CACHE_TTL_SECONDS)

    return pdfResponse(validPeriod, pdfBuffer)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Report generation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
