import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Plus, Building2, PenSquare, MessageSquare } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'

export default async function DashboardHome() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const workspaces = user.workspaceAccess.map((wa) => wa.workspace)
  const hasWorkspaces = workspaces.length > 0
  const firstName = user.name?.split(' ')[0] ?? null

  return (
    <div className="space-y-10 max-w-3xl">
      {/* Display heading */}
      <div className="space-y-1.5">
        <h1 className="font-display text-4xl text-text-primary leading-tight">
          {hasWorkspaces
            ? firstName
              ? `Good to see you, ${firstName}.`
              : 'Welcome back.'
            : 'Welcome to LYRA.'}
        </h1>
        <p className="font-sans text-sm text-text-secondary">
          {hasWorkspaces
            ? `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} under management.`
            : 'Create your first workspace to begin.'}
        </p>
      </div>

      {hasWorkspaces ? (
        <>
          {/* Workspaces */}
          <section className="space-y-3">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Workspaces
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {workspaces.map((ws) => (
                <Link
                  key={ws.id}
                  href={`/workspace/${ws.id}`}
                  className="group flex items-center justify-between p-5 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid transition-all duration-150"
                >
                  <div className="space-y-0.5">
                    <p className="font-sans text-sm font-medium text-text-primary">{ws.name}</p>
                    <p className="font-sans text-xs text-text-tertiary capitalize">
                      {ws.plan.charAt(0) + ws.plan.slice(1).toLowerCase()} plan
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    strokeWidth={1.5}
                    className="text-text-tertiary group-hover:text-text-secondary transition-colors shrink-0"
                  />
                </Link>
              ))}
            </div>
          </section>

          {/* Quick actions */}
          <section className="space-y-3">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">
              Quick actions
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link
                href={`/workspace/${workspaces[0].id}/compose`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid text-text-secondary hover:text-text-primary transition-all duration-150"
              >
                <PenSquare size={16} strokeWidth={1.5} className="shrink-0" />
                <span className="font-sans text-sm">Compose a post</span>
              </Link>
              <Link
                href={`/workspace/${workspaces[0].id}/inbox`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid text-text-secondary hover:text-text-primary transition-all duration-150"
              >
                <MessageSquare size={16} strokeWidth={1.5} className="shrink-0" />
                <span className="font-sans text-sm">View inbox</span>
              </Link>
              <Link
                href="/agency/clients/new"
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background-secondary border border-background-border hover:border-background-border-mid text-text-secondary hover:text-text-primary transition-all duration-150"
              >
                <Plus size={16} strokeWidth={1.5} className="shrink-0" />
                <span className="font-sans text-sm">Add workspace</span>
              </Link>
            </div>
          </section>
        </>
      ) : (
        /* Empty state */
        <section className="py-12 space-y-6">
          <div className="space-y-2">
            <Building2 size={24} strokeWidth={1.5} className="text-text-tertiary" />
            <p className="font-sans text-sm text-text-secondary">No workspaces yet.</p>
            <p className="font-sans text-sm text-text-tertiary max-w-xs leading-relaxed">
              A workspace represents one client or brand. Connect social accounts, and LYRA
              handles scheduling and AI responses from there.
            </p>
          </div>
          <Link
            href="/agency/clients/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-platinum text-background-primary font-sans text-sm font-medium hover:bg-accent-white transition-colors duration-150"
          >
            <Plus size={16} strokeWidth={2} />
            Create workspace
          </Link>
        </section>
      )}
    </div>
  )
}
