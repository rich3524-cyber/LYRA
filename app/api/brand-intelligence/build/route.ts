import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scrapeWebsite } from '@/services/brand-intelligence/scraper'
import { buildBrandProfile } from '@/services/brand-intelligence/profile-builder'
import { parseWorkspaceGuidelines } from '@/services/brand-intelligence/document-parser'
import { analyzeSocialPosts } from '@/services/brand-intelligence/social-analyzer'

export async function POST(req: Request) {
  try {
    const user = await requireAuth()
    const { workspaceId } = await req.json()

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, access: { some: { userId: user.id } } },
      include: { brandProfile: true, socialAccounts: { select: { platform: true, isActive: true } } },
    })
    if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Scrape website
    let websiteData = { title: '', description: '', bodyText: '', headings: [] as string[], metaKeywords: [] as string[] }
    if (workspace.websiteUrl) {
      try {
        websiteData = await scrapeWebsite(workspace.websiteUrl)
      } catch {
        console.warn(`Failed to scrape ${workspace.websiteUrl}`)
      }
    }

    // Parse brand guidelines from S3 (if any uploaded)
    const guidelinesText = workspace.brandProfile?.guidelineUrls?.length
      ? await parseWorkspaceGuidelines(workspace.brandProfile.guidelineUrls)
      : ''

    // TODO: Fetch real social posts from connected platform APIs
    const socialPosts: string[] = []
    const insights = analyzeSocialPosts(socialPosts)

    const profileData = await buildBrandProfile(websiteData, guidelinesText, socialPosts)

    // Map to schema fields — postingGuidelines → postingPatterns JSON
    await prisma.brandProfile.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        voiceSummary:    profileData.voiceSummary,
        toneAttributes:  profileData.toneAttributes,
        contentThemes:   profileData.contentThemes,
        audienceProfile: profileData.audienceProfile,
        postingPatterns: JSON.parse(JSON.stringify({ guidelines: profileData.postingGuidelines, socialInsights: insights })),
        websiteData:     JSON.parse(JSON.stringify(websiteData)),
        lastScrapedAt:   new Date(),
        lastUpdatedAt:   new Date(),
      },
      update: {
        voiceSummary:    profileData.voiceSummary,
        toneAttributes:  profileData.toneAttributes,
        contentThemes:   profileData.contentThemes,
        audienceProfile: profileData.audienceProfile,
        postingPatterns: JSON.parse(JSON.stringify({ guidelines: profileData.postingGuidelines, socialInsights: insights })),
        websiteData:     JSON.parse(JSON.stringify(websiteData)),
        lastScrapedAt:   new Date(),
        lastUpdatedAt:   new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const msg = error instanceof Error ? error.message : String(error)
    console.error('POST /api/brand-intelligence/build error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
