// Shared fetcher for every `useSWR` call in the app. Centralising this means
// every SWR-backed request gets consistent error handling for free -- a
// non-2xx response throws an Error (SWR's `error` state) instead of resolving
// to a body most callers would otherwise have to check `res.ok` on
// individually, the same mistake this migration is trying to move away from.
//
// Errors carry the parsed JSON body (when present) and HTTP status so
// components can surface a server-provided message the same way the
// hand-rolled fetch call sites already did (e.g. `data.error ?? 'fallback'`).
export class FetchError extends Error {
  info?: unknown
  status?: number
}

export async function swrFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const error = new FetchError('An error occurred while fetching the data.')
    error.status = res.status
    try {
      error.info = await res.json()
    } catch {
      // Response body wasn't JSON -- leave `info` undefined rather than fail
      // the error path itself.
    }
    throw error
  }
  return res.json() as Promise<T>
}
