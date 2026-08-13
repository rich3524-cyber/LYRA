'use client'

import { useEffect } from 'react'

// Only fires when the ROOT LAYOUT ITSELF throws (vs. app/error.tsx, which
// covers errors in a page/nested layout while the root layout keeps
// rendering). Next.js requires this file to render its own <html>/<body>,
// since the root layout that would normally provide them didn't render.
// Deliberately plain, unstyled HTML -- if the root layout itself is broken,
// this is the one place that must not depend on anything that could also
// be broken (fonts, globals.css, shared components).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled root layout error:', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '4rem 1.5rem' }}>
        <h1>Something went wrong</h1>
        <p>LYRA hit an unexpected error. Try again, or come back in a moment.</p>
        <button onClick={reset} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
          Try again
        </button>
      </body>
    </html>
  )
}
