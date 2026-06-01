import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'LYRA — Beta Feedback',
  description: 'Share your experience with LYRA during the beta program.',
  robots: 'noindex, nofollow',
}

export default function BetaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
