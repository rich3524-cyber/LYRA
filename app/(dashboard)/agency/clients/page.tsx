import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Globe, Building2 } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function ClientsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const workspaces = await prisma.workspace.findMany({
    where: { access: { some: { userId: user.id } } },
    select: {
      id: true,
      name: true,
      industry: true,
      websiteUrl: true,
      clientAccessLevel: true,
      aiResponseMode: true,
      plan: true,
      _count: { select: { socialAccounts: true } },
    },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl text-text-primary">Clients</h2>
          <p className="text-text-secondary text-sm mt-1">
            {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/agency/clients/new"
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent-platinum text-text-inverse hover:bg-accent-white px-3 h-8 rounded-md transition-colors"
        >
          <Plus size={13} />
          New workspace
        </Link>
      </div>

      {workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 size={40} className="text-text-tertiary mb-4" />
          <p className="text-text-secondary text-sm">No workspaces yet.</p>
          <p className="text-text-tertiary text-xs mt-1">Create your first client workspace to get started.</p>
          <Link
            href="/agency/clients/new"
            className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium bg-accent-platinum text-text-inverse hover:bg-accent-white px-3 h-8 rounded-md transition-colors"
          >
            <Plus size={13} />
            New workspace
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/workspace/${ws.id}`}
              className="group block rounded-xl bg-background-secondary border border-background-border p-5 hover:border-background-border-mid hover:bg-background-tertiary transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate group-hover:text-accent-platinum transition-colors">
                    {ws.name}
                  </p>
                  {ws.industry && (
                    <p className="text-xs text-text-tertiary mt-0.5 truncate">{ws.industry}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs font-mono text-text-tertiary bg-background-primary px-2 py-0.5 rounded-full border border-background-border">
                  {ws.plan}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-4 text-xs text-text-tertiary">
                <span className="flex items-center gap-1">
                  <Globe size={11} />
                  {ws._count.socialAccounts} account{ws._count.socialAccounts !== 1 ? 's' : ''}
                </span>
                <span className="capitalize">{ws.aiResponseMode?.toLowerCase().replace('_', ' ') ?? 'Off'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
