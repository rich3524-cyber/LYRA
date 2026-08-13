import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background-primary px-6 text-center">
      <p className="font-mono text-sm text-text-tertiary">404</p>
      <h1 className="font-display text-2xl text-text-primary">Page not found</h1>
      <p className="max-w-sm text-sm text-text-secondary">
        The page you&apos;re looking for doesn&apos;t exist, or you may not have access to it.
      </p>
      <Link href="/" className={buttonVariants({ className: 'mt-2' })}>
        Return home
      </Link>
    </div>
  )
}
