'use client'

import { SWRConfig } from 'swr'
import { swrFetcher } from '@/lib/swr-fetcher'

// App-wide SWR defaults, wired in alongside the other cross-cutting client
// providers in app/layout.tsx (TooltipProvider, NavigationLoader).
//
// - `fetcher` is shared (see lib/swr-fetcher.ts) so every call site gets the
//   same non-2xx -> thrown-error behaviour without repeating it.
// - `revalidateOnFocus: true` (SWR's default) is kept rather than disabled --
//   several hand-rolled fetch effects already re-fetched on `window.addEventListener('focus', ...)`
//   (e.g. the sidebar's unread-comment count), so this is a default this
//   codebase's own patterns already wanted, not a blind library default.
// - `dedupingInterval: 5000` avoids duplicate network requests for the same
//   key within a 5s window -- enough to dedupe the common case (multiple
//   components mounting together on a navigation, e.g. the sidebar and a
//   page both reading `/api/workspaces`) without masking a genuinely fresh
//   fetch a user triggers a few seconds later.
// - `shouldRetryOnError: false` overrides SWR's default exponential-backoff
//   retry. None of the hand-rolled fetch effects this migration replaces
//   ever retried on failure (they surfaced a toast/error state once and
//   stopped), so auto-retry would be new, surprising background-request
//   behaviour rather than a like-for-like port.
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: true,
        dedupingInterval: 5000,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  )
}
