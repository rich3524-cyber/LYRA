const TIMEOUT_MS = 20_000

export class LyraApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(`LYRA API request failed: ${status} ${JSON.stringify(body)}`)
    this.name = 'LyraApiError'
    this.status = status
    this.body = body
  }
}

// Thrown when the request is aborted by AbortSignal.timeout(TIMEOUT_MS)
// (fetch rejects with a DOMException named 'TimeoutError' in that case).
export class LyraApiTimeoutError extends Error {
  constructor(cause: unknown) {
    super('LYRA API request timed out')
    this.name = 'LyraApiTimeoutError'
    this.cause = cause
  }
}

// Thrown for anything else that goes wrong before we have a parsed response
// body to work with -- DNS/connection failures (fetch rejects with a
// TypeError), and malformed/non-JSON response bodies (res.json() rejects).
export class LyraApiNetworkError extends Error {
  constructor(cause: unknown) {
    super('LYRA API request failed due to a network error')
    this.name = 'LyraApiNetworkError'
    this.cause = cause
  }
}

// Every one of the tool modules that build on top of this client calls
// through this single function, so it normalizes every failure mode into a
// small, closed set of error types (LyraApiError / LyraApiTimeoutError /
// LyraApiNetworkError) instead of letting callers deal with whatever `fetch`
// or `res.json()` happen to throw (DOMException, TypeError, SyntaxError, ...).
export async function callLyraApi<T = unknown>(
  path: string,
  bearerToken: string,
  queryParams?: Record<string, string>
): Promise<T> {
  const baseUrl = process.env.LYRA_API_BASE_URL
  const url = new URL(path, baseUrl)
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value)
    }
  }

  let res: Response
  let body: unknown
  try {
    res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${bearerToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    body = await res.json()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new LyraApiTimeoutError(err)
    }
    throw new LyraApiNetworkError(err)
  }

  if (!res.ok) {
    throw new LyraApiError(res.status, body)
  }
  return body as T
}

// POST-capable sibling to callLyraApi, for the write tools. Shares the same
// error normalization (LyraApiError / LyraApiTimeoutError / LyraApiNetworkError).
export async function postLyraApi<T = unknown>(
  path: string,
  bearerToken: string,
  body: unknown
): Promise<T> {
  const baseUrl = process.env.LYRA_API_BASE_URL
  const url = new URL(path, baseUrl)

  let res: Response
  let responseBody: unknown
  try {
    res = await fetch(url.toString(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    responseBody = await res.json()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new LyraApiTimeoutError(err)
    }
    throw new LyraApiNetworkError(err)
  }

  if (!res.ok) {
    throw new LyraApiError(res.status, responseBody)
  }
  return responseBody as T
}
