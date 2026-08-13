'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

// Root error boundary -- without this, a thrown Server Component error
// (e.g. a failed Prisma query) crashed the entire route to Next's default
// unstyled error screen instead of a scoped, branded boundary.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled route error:', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background-primary px-6 text-center">
      <h1 className="font-display text-2xl text-text-primary">Something went wrong</h1>
      <p className="max-w-sm text-sm text-text-secondary">
        We hit an unexpected error loading this page. Try again, or head back to the dashboard.
      </p>
      <div className="mt-2 flex gap-3">
        <button onClick={reset} className={buttonVariants({ variant: 'outline' })}>
          Try again
        </button>
        <Link href="/" className={buttonVariants()}>
          Return home
        </Link>
      </div>
    </div>
  )
}
