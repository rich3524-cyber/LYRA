import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'LYRA — Share Feedback',
  description: 'Submit ongoing feedback during the LYRA beta program.',
  robots: 'noindex, nofollow',
}

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
