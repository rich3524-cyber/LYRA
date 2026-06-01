import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'LYRA Admin — Beta Responses',
  robots: 'noindex, nofollow',
}

export default function AdminBetaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
