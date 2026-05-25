import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateNarrative } from '@/services/reports/narrative-generator'
import { renderReport, ReportData } from '@/services/reports/report-renderer'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId, period } = await req.json() as { workspaceId: string; period: '7d' | '30d' }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      select: { id: true, name: true, plan: true },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (workspace.plan === 'STARTER') {
      return NextResponse.json({ error: 'Reports require PRO or AGENCY plan.' }, { status: 403 })
    }

    const days = period === '7d' ? 7 : 30
    const periodStart = new Date()
    periodStart.setDate(periodStart.getDate() - days)

    const posts = await prisma.post.findMany({
      where: {
        workspaceId,
        status: 'PUBLISHED',
        scheduledAt: { gte: periodStart },
      },
      include: {
        metrics: true,
        socialAccount: { select: { platform: true } },
      },
      orderBy: { scheduledAt: 'desc' },
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
        scheduledAt: p.scheduledAt ? new Date(p.scheduledAt).toLocaleDateString() : '',
        contentExcerpt: (p.content ?? '').slice(0, 120),
        impressions: p.metrics!.impressions ?? 0,
        engagements: engagementsOf(p.metrics),
      }))

    const reportDataWithoutNarrative = {
      workspaceName: workspace.name,
      period,
      generatedAt: new Date().toLocaleDateString(),
      summary: { totalPosts: posts.length, totalImpressions, totalEngagements, avgEngRate, bestPlatform },
      platforms,
      topPosts,
      narrative: '',
    }

    const narrative = await generateNarrative(reportDataWithoutNarrative)
    const reportData: ReportData = { ...reportDataWithoutNarrative, narrative }

    const pdfBuffer = await renderReport(reportData)

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="lyra-report-${period}-${Date.now()}.pdf"`,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Report generation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
