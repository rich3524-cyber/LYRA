import Link from 'next/link'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background-primary">
      <header className="border-b border-background-border">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="font-sans text-sm font-medium text-text-primary tracking-[0.25em]">
            LYRA
          </Link>
          <Link
            href="/auth/login"
            className="font-sans text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Back to app
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        {children}
      </main>

      <footer className="border-t border-background-border mt-16">
        <div className="max-w-3xl mx-auto px-6 py-8 flex items-center justify-between">
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
