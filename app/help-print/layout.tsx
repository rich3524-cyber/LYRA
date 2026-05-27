import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'LYRA Help Guide',
  robots: 'noindex, nofollow',
}

export default function HelpPrintLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
