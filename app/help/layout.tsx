import Link from 'next/link'
import { PdfDownloadButton } from '@/components/lyra/help/pdf-download-button'

const sections = [
  { id: 'getting-started',     label: 'Getting Started' },
  { id: 'workspaces',          label: 'Workspaces' },
  { id: 'social-connections',  label: 'Social Connections' },
  { id: 'brand-intelligence',  label: 'Brand Intelligence' },
  { id: 'content-calendar',    label: 'Content Calendar' },
  { id: 'compose',             label: 'Compose' },
  { id: 'inbox',               label: 'Inbox' },
  { id: 'seo',                 label: 'SEO' },
  { id: 'analytics',           label: 'Analytics' },
  { id: 'settings',            label: 'Settings' },
  { id: 'billing',             label: 'Billing' },
]

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background-primary">
      <header className="sticky top-0 z-30 border-b border-background-border bg-background-primary/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-sans text-sm font-medium text-text-primary tracking-[0.25em]">
              LYRA
            </Link>
            <span className="text-background-border">|</span>
            <span className="font-sans text-sm text-text-tertiary">Documentation</span>
          </div>
          <div className="flex items-center gap-5">
            <PdfDownloadButton />
            <span className="text-background-border">|</span>
            <Link
              href="/auth/login"
              className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Back to app
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12 flex gap-12">
        {/* Sidebar */}
        <aside className="hidden lg:block w-52 shrink-0">
          <div className="sticky top-28 space-y-1">
            <p className="font-sans text-[11px] font-medium text-text-tertiary uppercase tracking-[0.1em] mb-4">
              Contents
            </p>
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block font-sans text-sm text-text-tertiary hover:text-text-secondary transition-colors py-1"
              >
                {s.label}
              </a>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>

      <footer className="border-t border-background-border mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
          <p className="font-sans text-xs text-text-tertiary">
            © {new Date().getFullYear()} LYRA. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/legal/privacy" className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors">
              Privacy Policy
            </Link>
            <Link href="/legal/terms" className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
