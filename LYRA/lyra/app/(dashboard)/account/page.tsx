import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DeleteAccountButton } from '@/components/lyra/account/delete-account-button'

const PLAN_LABELS: Record<string, string> = {
  STARTER: 'Starter',
  PRO:     'Pro',
  AGENCY:  'Agency',
}

export default async function AccountPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const agency = await prisma.agency.findFirst({
    where: { members: { some: { id: user.id } } },
    select: { id: true, plan: true, foundingMember: true, stripeCustomerId: true },
  }).catch(() => null)

  const plan = agency?.plan ?? 'STARTER'
  const foundingMember = agency?.foundingMember ?? false
  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user.email[0].toUpperCase()

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-0.5">
        <h1 className="font-display text-4xl text-text-primary">Account</h1>
        <p className="font-sans text-sm text-text-secondary">{user.email}</p>
      </div>

      {/* Profile */}
      <section className="space-y-3">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Profile
        </p>
        <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-background-tertiary border border-background-border flex items-center justify-center shrink-0">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt={user.name ?? user.email}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="font-sans text-sm font-medium text-text-secondary">{initials}</span>
              )}
            </div>
            <div className="space-y-0.5">
              {user.name && (
                <p className="font-sans text-sm font-medium text-text-primary">{user.name}</p>
              )}
              <p className="font-sans text-sm text-text-secondary">{user.email}</p>
            </div>
          </div>
          <p className="font-sans text-xs text-text-tertiary">
            Profile details are managed through your login provider.
          </p>
        </div>
      </section>

      {/* Plan & Billing */}
      <section className="space-y-3">
        <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
          Plan &amp; Billing
        </p>
        <div className="p-5 rounded-xl bg-background-secondary border border-background-border space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-background-border-mid font-sans text-xs text-text-secondary">
                  {PLAN_LABELS[plan] ?? plan}
                </span>
                {foundingMember && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-accent-silver/30 font-sans text-[10px] font-medium text-accent-silver tracking-[0.08em] uppercase">
                    Founding Member
                  </span>
                )}
              </div>
              <p className="font-sans text-xs text-text-tertiary">
                {foundingMember
                  ? 'Your price is locked forever.'
                  : 'Upgrade to unlock more workspaces and AI features.'}
              </p>
            </div>
            <Link
              href="/account/billing"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-all duration-150 bg-background-tertiary border border-background-border-mid text-text-secondary hover:text-text-primary hover:border-accent-silver"
            >
              <ExternalLink size={12} strokeWidth={1.5} />
              Manage billing
            </Link>
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section className="space-y-3 pt-4 border-t border-status-error/20">
        <p className="font-sans text-[11px] font-medium text-status-error/70 uppercase tracking-[0.1em]">
          Danger Zone
        </p>
        <div className="p-5 rounded-xl bg-background-secondary border border-status-error/20 space-y-3">
          <div className="space-y-0.5">
            <p className="font-sans text-sm font-medium text-text-primary">Delete account</p>
            <p className="font-sans text-xs text-text-tertiary leading-relaxed">
              Permanently deletes your account and all associated workspaces, posts, and data.
            </p>
          </div>
          <DeleteAccountButton />
        </div>
      </section>
    </div>
  )
}
