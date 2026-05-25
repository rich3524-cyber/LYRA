import { redirect, notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { CheckCircle, Link2, Link2Off } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DeleteWorkspaceButton } from '@/components/lyra/settings/delete-workspace-button'
import { CrisisAwareToggle } from '@/components/lyra/settings/crisis-aware-toggle'

interface Props {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ connected?: string }>
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
    name: 'Facebook & Instagram',
    description: 'Schedule posts, respond to comments, and connect linked Instagram Business accounts.',
    dbPlatforms: ['FACEBOOK', 'INSTAGRAM'],
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
]

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  GOOGLE_BUSINESS: 'Google Business',
  TWITTER: 'X (Twitter)',
  TIKTOK: 'TikTok',
}

export default async function SettingsPage({ params, searchParams }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const { workspaceId } = await params
  const { connected } = await searchParams

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, access: { some: { userId: user.id } } },
    select: { id: true, name: true, crisisAware: true, plan: true },
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

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div className="space-y-0.5">
        <h1 className="font-display text-4xl text-text-primary">Settings</h1>
        <p className="font-sans text-sm text-text-secondary">{workspace.name}</p>
      </div>

      {/* Success banner */}
      {connectedPlatformLabel && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border">
          <CheckCircle size={16} strokeWidth={1.5} className="text-status-success shrink-0" />
          <p className="font-sans text-sm text-text-primary">
            {connectedPlatformLabel} connected successfully.
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
                    href={`/api/social/connect/${platform.id}?workspaceId=${workspaceId}`}
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

      {/* Add-ons */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium font-sans text-text-primary">Add-ons</h2>
        <CrisisAwareToggle
          workspaceId={workspace.id}
          enabled={workspace.crisisAware}
          isPro={workspace.plan === 'PRO' || workspace.plan === 'AGENCY'}
        />
      </section>

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
