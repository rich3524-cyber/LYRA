import { redirect, notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { CheckCircle, Link2, Link2Off, AlertCircle } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DeleteWorkspaceButton } from '@/components/lyra/settings/delete-workspace-button'
import { CrisisAwareToggle } from '@/components/lyra/settings/crisis-aware-toggle'
import { AutonomySelector } from '@/components/lyra/settings/autonomy-selector'
import { FacebookPagePicker } from '@/components/lyra/settings/facebook-page-picker'
import { TimezoneSelector } from '@/components/lyra/settings/timezone-selector'
import { EmailMarketingSection } from '@/components/lyra/settings/email-marketing-section'

interface Props {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ connected?: string; fbpending?: string; error?: string }>
}

interface PlatformConfig {
  id: string
  name: string
  description: string
  dbPlatforms: string[]
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Schedule posts and respond to comments on your Facebook Page.',
    dbPlatforms: ['FACEBOOK'],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Schedule posts and respond to comments on your Instagram Business account. Connected separately from Facebook.',
    dbPlatforms: ['INSTAGRAM'],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    description: 'Publish to company pages and monitor professional content engagement.',
    dbPlatforms: ['LINKEDIN'],
  },
  {
    id: 'google',
    name: 'Google Business',
    description: 'Respond to reviews and manage your Google Business Profile.',
    dbPlatforms: ['GOOGLE_BUSINESS'],
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    description: 'Schedule posts and monitor replies.',
    dbPlatforms: ['TWITTER'],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    description: 'Publish video content and monitor engagement.',
    dbPlatforms: ['TIKTOK'],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Publish videos and monitor comments on your YouTube channel.',
    dbPlatforms: ['YOUTUBE'],
  },
]

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  GOOGLE_BUSINESS: 'Google Business',
  TWITTER: 'X (Twitter)',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
}

export default async function SettingsPage({ params, searchParams }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params
  const { connected, fbpending, error } = await searchParams

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true, name: true, crisisAware: true, plan: true, timezone: true, aiResponseMode: true },
  })
  if (!workspace) notFound()

  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId, isActive: true },
    select: { id: true, platform: true, name: true, handle: true },
    orderBy: { platform: 'asc' },
  })

  async function disconnectAccount(formData: FormData) {
    'use server'
    const accountId = formData.get('accountId') as string
    if (!accountId) return
    const currentUser = await getCurrentUser()
    if (!currentUser) return
    await prisma.socialAccount.updateMany({
      where: {
        id: accountId,
        workspace: { access: { some: { userId: currentUser.id } } },
      },
      data: { isActive: false },
    })
    revalidatePath(`/workspace/${workspaceId}/settings`)
  }

  const connectedPlatformLabel = connected
    ? PLATFORM_LABELS[connected.toUpperCase()] ?? connected
    : null

  const CONNECT_ERRORS: Record<string, string> = {
    linkedin_no_orgs:
      'No LinkedIn company pages found. You must be an admin of at least one LinkedIn Page to connect. LYRA connects company pages, not personal profiles.',
    oauth_failed: 'The connection could not be completed. Try again.',
    zernio_connect_failed: 'The connection could not be completed via Zernio. Try again.',
    zernio_no_facebook_pages:
      "Zernio couldn't find a Facebook Page to connect. If you have full admin access to the Page and it's in the right Business Portfolio, this usually means the connecting app itself was never authorized at the Meta Business level — check Business Settings → Integrations for the Business Portfolio and confirm \"Social Media Connector\" is listed there. If it's missing despite a successful-looking consent flow, that's a Meta/Zernio-side registration issue — contact Zernio support rather than retrying.",
  }
  const connectErrorMessage = error
    ? CONNECT_ERRORS[error] ?? 'The connection could not be completed. Try again.'
    : null

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div className="space-y-0.5">
        <h1 className="font-display text-4xl text-text-primary">Settings</h1>
        <p className="font-sans text-sm text-text-secondary">{workspace.name}</p>
      </div>

      {/* Facebook Page picker — shown after OAuth redirect with ?fbpending= */}
      {fbpending && (
        <FacebookPagePicker pendingKey={fbpending} workspaceId={workspaceId} />
      )}

      {/* Success banner */}
      {connectedPlatformLabel && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border">
          <CheckCircle size={16} strokeWidth={1.5} className="text-status-success shrink-0" />
          <p className="font-sans text-sm text-text-primary">
            {connectedPlatformLabel} connected successfully.
          </p>
        </div>
      )}

      {/* Error banner — shown after a failed OAuth redirect with ?error= */}
      {connectErrorMessage && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border">
          <AlertCircle size={16} strokeWidth={1.5} className="text-status-error shrink-0 mt-0.5" />
          <p className="font-sans text-sm text-text-primary">
            {connectErrorMessage}
          </p>
        </div>
      )}

      {/* Social accounts */}
      <section className="space-y-3">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Social Accounts
        </p>

        <div className="space-y-2">
          {PLATFORMS.map((platform) => {
            const connected = accounts.filter((a) =>
              platform.dbPlatforms.includes(a.platform)
            )
            const isConnected = connected.length > 0

            return (
              <div
                key={platform.id}
                className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="font-sans text-sm font-medium text-text-primary">
                      {platform.name}
                    </p>
                    <p className="font-sans text-xs text-text-tertiary leading-relaxed">
                      {platform.description}
                    </p>
                  </div>

                  <Link
                    href={`/api/social/connect/${platform.id}?workspaceId=${workspaceId}${platform.id === 'facebook' ? '&rerequest=true' : ''}`}
                    prefetch={false}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-all duration-150 bg-background-tertiary border border-background-border-mid text-text-secondary hover:text-text-primary hover:border-accent-silver"
                  >
                    <Link2 size={12} strokeWidth={1.5} />
                    {isConnected ? 'Reconnect' : 'Connect'}
                  </Link>
                </div>

                {/* Connected accounts */}
                {connected.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-background-border">
                    {connected.map((account) => (
                      <div
                        key={account.id}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-status-success shrink-0" />
                          <span className="font-sans text-xs text-text-secondary">
                            {account.name}
                          </span>
                          <span className="font-mono text-xs text-text-tertiary">
                            {PLATFORM_LABELS[account.platform]}
                          </span>
                        </div>
                        <form action={disconnectAccount}>
                          <input type="hidden" name="accountId" value={account.id} />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-status-error transition-colors"
                          >
                            <Link2Off size={12} strokeWidth={1.5} />
                            Disconnect
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Timezone */}
      <section className="space-y-3">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Timezone
        </p>
        <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-1">
          <p className="font-sans text-xs text-text-tertiary leading-relaxed mb-3">
            Post scheduling uses this timezone. Set it to match your audience or client location.
          </p>
          <TimezoneSelector
            workspaceId={workspace.id}
            currentTimezone={workspace.timezone}
          />
        </div>
      </section>

      {/* Automation */}
      <section className="space-y-3">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Automation
        </p>
        <AutonomySelector
          workspaceId={workspace.id}
          currentMode={workspace.aiResponseMode}
          isPro={workspace.plan === 'PRO' || workspace.plan === 'AGENCY'}
        />
      </section>

      {/* Add-ons */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium font-sans text-text-primary">Add-ons</h2>
        <CrisisAwareToggle
          workspaceId={workspace.id}
          enabled={workspace.crisisAware}
          isPro={workspace.plan === 'PRO' || workspace.plan === 'AGENCY'}
        />
      </section>

      {/* Email Marketing */}
      <EmailMarketingSection workspaceId={workspace.id} />

      {/* Danger zone */}
      <section className="space-y-3 pt-4 border-t border-background-border">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Danger Zone
        </p>
        <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-3">
          <div className="space-y-0.5">
            <p className="font-sans text-sm font-medium text-text-primary">Delete this workspace</p>
            <p className="font-sans text-xs text-text-tertiary leading-relaxed">
              Permanently removes the workspace, all social accounts, posts, and brand profile.
            </p>
          </div>
          <DeleteWorkspaceButton workspaceId={workspace.id} workspaceName={workspace.name} />
        </div>
      </section>
    </div>
  )
}
