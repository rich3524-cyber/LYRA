import { redirect, notFound } from 'next/navigation'
import { Zap, Globe, Share2, Lock } from 'lucide-react'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BrandBuildButton } from '@/components/lyra/brand/brand-build-button'
import { GuidelinesUploader } from '@/components/lyra/brand/guidelines-uploader'

interface Props {
  params: Promise<{ workspaceId: string }>
}

interface AudienceProfile {
  demographics?: string
  interests?: string[]
  painPoints?: string[]
  languageLevel?: string
}

interface PostingPatterns {
  guidelines?: string
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default async function BrandPage({ params }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      brandProfile: true,
      _count: { select: { socialAccounts: { where: { isActive: true } } } },
    },
  })
  if (!workspace) notFound()

  const hasWebsite  = !!workspace.websiteUrl
  const hasSocial   = (workspace._count?.socialAccounts ?? 0) > 0
  const brandReady  = hasWebsite && hasSocial
  const profile     = workspace.brandProfile
  const audience    = profile?.audienceProfile as AudienceProfile | null
  const patterns    = profile?.postingPatterns as PostingPatterns | null

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="font-display text-4xl text-text-primary">Brand Intelligence</h1>
          <p className="font-sans text-sm text-text-secondary">
            {profile?.lastUpdatedAt
              ? `Updated ${timeAgo(profile.lastUpdatedAt)} · ${workspace.name}`
              : workspace.name}
          </p>
        </div>
        <div className="shrink-0 pt-1">
          <BrandBuildButton workspaceId={workspaceId} hasProfile={!!profile} />
        </div>
      </div>

      {!brandReady ? (
        /* Setup gate */
        <div className="py-16 space-y-6">
          <div className="space-y-3">
            <Lock size={24} strokeWidth={1.5} className="text-text-tertiary" />
            <div className="space-y-1">
              <p className="font-sans text-sm text-text-secondary">Brand AI is not yet available.</p>
              <p className="font-sans text-sm text-text-tertiary max-w-sm leading-relaxed">
                Complete the steps below in Settings, then return here to build your brand profile.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${hasWebsite ? 'border-status-success bg-status-success' : 'border-background-border-mid'}`}>
                {hasWebsite && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke="#080808" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <Globe size={14} strokeWidth={1.5} className="text-text-tertiary" />
              <span className="font-sans text-sm text-text-tertiary">Website URL added</span>
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${hasSocial ? 'border-status-success bg-status-success' : 'border-background-border-mid'}`}>
                {hasSocial && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke="#080808" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <Share2 size={14} strokeWidth={1.5} className="text-text-tertiary" />
              <span className="font-sans text-sm text-text-tertiary">At least one social account connected</span>
            </div>
          </div>
          <Link
            href={`/workspace/${workspaceId}/settings`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
          >
            Go to Settings
          </Link>
        </div>
      ) : !profile ? (
        /* Ready but no profile built yet */
        <div className="py-8 space-y-6">
          <div className="space-y-3">
            <Zap size={24} strokeWidth={1.5} className="text-text-tertiary" />
            <div className="space-y-1">
              <p className="font-sans text-sm text-text-secondary">No brand profile built yet.</p>
              <p className="font-sans text-sm text-text-tertiary max-w-sm leading-relaxed">
                LYRA will scrape {workspace.websiteUrl} and analyse your connected social accounts
                to build your brand voice profile. The more accounts connected, the sharper the result.
              </p>
            </div>
          </div>

          {/* Guidelines upload available before first build */}
          <div className="space-y-2">
            <p className="font-sans text-xs text-text-tertiary">
              Optionally upload brand guidelines before building your profile.
            </p>
            <GuidelinesUploader workspaceId={workspaceId} guidelineUrls={[]} />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Voice Summary */}
          <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Voice Summary
            </p>
            <p className="font-sans text-sm text-text-primary leading-relaxed">
              {profile.voiceSummary ?? '—'}
            </p>
          </section>

          {/* Tone + Themes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                Tone Attributes
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.toneAttributes.length > 0
                  ? profile.toneAttributes.map((attr) => (
                      <span
                        key={attr}
                        className="px-2 py-1 rounded-md bg-background-tertiary border border-background-border-mid font-sans text-xs text-text-secondary"
                      >
                        {attr}
                      </span>
                    ))
                  : <p className="font-sans text-xs text-text-tertiary">None identified.</p>
                }
              </div>
            </section>

            <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                Content Themes
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.contentThemes.length > 0
                  ? profile.contentThemes.map((theme) => (
                      <span
                        key={theme}
                        className="px-2 py-1 rounded-md bg-background-tertiary border border-background-border-mid font-sans text-xs text-text-secondary"
                      >
                        {theme}
                      </span>
                    ))
                  : <p className="font-sans text-xs text-text-tertiary">None identified.</p>
                }
              </div>
            </section>
          </div>

          {/* Audience */}
          {audience && (
            <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                Audience Profile
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {audience.demographics && (
                  <div className="space-y-1">
                    <p className="font-sans text-xs text-text-tertiary">Demographics</p>
                    <p className="font-sans text-sm text-text-primary">{audience.demographics}</p>
                  </div>
                )}
                {audience.languageLevel && (
                  <div className="space-y-1">
                    <p className="font-sans text-xs text-text-tertiary">Language level</p>
                    <p className="font-sans text-sm text-text-primary capitalize">{audience.languageLevel}</p>
                  </div>
                )}
              </div>
              {Array.isArray(audience.interests) && audience.interests.length > 0 && (
                <div className="space-y-2">
                  <p className="font-sans text-xs text-text-tertiary">Interests</p>
                  <div className="flex flex-wrap gap-2">
                    {audience.interests.map((item) => (
                      <span
                        key={item}
                        className="px-2 py-1 rounded-md bg-background-tertiary border border-background-border-mid font-sans text-xs text-text-secondary"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(audience.painPoints) && audience.painPoints.length > 0 && (
                <div className="space-y-2">
                  <p className="font-sans text-xs text-text-tertiary">Pain points</p>
                  <ul className="space-y-1">
                    {audience.painPoints.map((point) => (
                      <li key={point} className="font-sans text-sm text-text-primary flex items-start gap-2">
                        <span className="text-text-tertiary mt-0.5 shrink-0">–</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Posting Guidelines */}
          {patterns?.guidelines && (
            <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
              <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
                Posting Guidelines
              </p>
              <p className="font-sans text-sm text-text-primary leading-relaxed whitespace-pre-line">
                {patterns.guidelines}
              </p>
            </section>
          )}

          {/* Brand guidelines documents */}
          <section className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Brand guidelines
            </p>
            <p className="font-sans text-xs text-text-tertiary">
              Upload PDF or DOCX brand guidelines. LYRA uses these documents when building your brand profile.
            </p>
            <GuidelinesUploader
              workspaceId={workspaceId}
              guidelineUrls={profile.guidelineUrls}
            />
          </section>

          {/* Metadata */}
          <div className="flex items-center gap-6 pt-2">
            {profile.lastScrapedAt && (
              <div className="space-y-0.5">
                <p className="font-sans text-[11px] text-text-tertiary uppercase tracking-[0.1em]">Website scraped</p>
                <p className="font-mono text-xs text-text-secondary">{timeAgo(profile.lastScrapedAt)}</p>
              </div>
            )}
            {profile.lastUpdatedAt && (
              <div className="space-y-0.5">
                <p className="font-sans text-[11px] text-text-tertiary uppercase tracking-[0.1em]">Profile built</p>
                <p className="font-mono text-xs text-text-secondary">{timeAgo(profile.lastUpdatedAt)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
