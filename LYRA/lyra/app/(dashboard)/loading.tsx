import { Loader2 } from 'lucide-react'

// Generic dashboard-wide loading UI -- covers every route under (dashboard)
// that doesn't define its own more specific loading.tsx. Without this,
// navigating to a page that does multiple sequential server-side queries
// (e.g. brand/page.tsx) blocked the full page paint instead of letting the
// shell render immediately with a loading state.
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={20} strokeWidth={1.5} className="animate-spin text-text-tertiary" />
        <p className="text-sm text-text-tertiary">Loading…</p>
      </div>
    </div>
  )
}
