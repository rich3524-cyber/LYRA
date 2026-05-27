import type { ReactNode } from 'react'

export function Divider() {
  return <hr className="border-background-border" />
}

export function SectionHeader({ n, title }: { n: string; title: string }) {
  return (
    <div className="space-y-2">
      <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em]">{n}</p>
      <h2 className="font-display text-3xl text-text-primary">{title}</h2>
    </div>
  )
}

export function Subsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-sans text-sm font-medium text-text-primary">{title}</h3>
      <div className="space-y-3 font-sans text-sm text-text-secondary leading-relaxed">{children}</div>
    </div>
  )
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-medium text-text-primary">{children}</strong>
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-2">{children}</ol>
}

export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3 font-sans text-sm text-text-secondary">
      <span className="shrink-0 font-mono text-xs text-text-tertiary mt-0.5 w-4">{n}.</span>
      <span className="leading-relaxed">{children}</span>
    </li>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-background-secondary border border-background-border">
      <p className="font-sans text-xs text-text-tertiary leading-relaxed">
        <span className="font-medium text-text-secondary">Note: </span>
        {children}
      </p>
    </div>
  )
}

export function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-background-secondary border border-background-border">
      <p className="font-sans text-sm text-text-secondary">{children}</p>
    </div>
  )
}

export function PlatformBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-xs text-accent-silver bg-background-secondary border border-background-border mr-1.5">
      {children}
    </span>
  )
}

export function StatusBadge({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-sans text-xs border mx-0.5 ${color}`}>
      {children}
    </span>
  )
}

export function StatusRow({ status, color, children }: { status: string; color: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 pt-0.5">
        <StatusBadge color={color}>{status}</StatusBadge>
      </div>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}

export function MetricRow({ metric, children }: { metric: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <p className="font-sans text-sm font-medium text-text-primary shrink-0 w-36">{metric}</p>
      <p className="font-sans text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  )
}
