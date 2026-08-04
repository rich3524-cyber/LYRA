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

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${bearerToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

  const body = await res.json()
  if (!res.ok) {
    throw new LyraApiError(res.status, body)
  }
  return body as T
}
