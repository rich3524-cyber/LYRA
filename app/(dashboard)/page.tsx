export default function DashboardHome() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl text-text-primary">Dashboard</h2>
        <p className="text-text-secondary text-sm mt-1">
          Welcome to LYRA. Select a workspace to get started.
        </p>
      </div>

      {/* Skeleton placeholders — real content added in Task 4+ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-xl bg-background-secondary border border-background-border animate-pulse"
          />
        ))}
      </div>

      <div className="h-64 rounded-xl bg-background-secondary border border-background-border animate-pulse" />
    </div>
  )
}
