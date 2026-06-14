const GSC_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GSC_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GSC_API_URL = 'https://searchconsole.googleapis.com/webmasters/v3'

export function getAuthUrl(workspaceId: string): string {
  const state = Buffer.from(JSON.stringify({ workspaceId })).toString('base64')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URI!,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${GSC_AUTH_URL}?${params}`
}

export async function exchangeCode(
  code: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(GSC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URI!,
      client_id: process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET!,
    }),
  })
  const data = await res.json() as {
    access_token: string
    refresh_token: string
    error?: string
  }
  if (data.error) throw new Error(`GSC token exchange failed: ${data.error}`)
  return { accessToken: data.access_token, refreshToken: data.refresh_token }
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(GSC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET!,
    }),
  })
  const data = await res.json() as { access_token: string; error?: string }
  if (data.error) throw new Error(`GSC token refresh failed: ${data.error}`)
  return data.access_token
}

export async function getSites(accessToken: string): Promise<string[]> {
  const res = await fetch(`${GSC_API_URL}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json() as { siteEntry?: Array<{ siteUrl: string }> }
  return (data.siteEntry ?? []).map((s) => s.siteUrl)
}

export interface GscQuery {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export async function getTopQueries(
  accessToken: string,
  propertyUrl: string,
  days = 90
): Promise<GscQuery[]> {
  const endDate = new Date().toISOString().slice(0, 10)
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

  const res = await fetch(
    `${GSC_API_URL}/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 25,
        orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
      }),
    }
  )
  const data = await res.json() as {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>
  }
  return (data.rows ?? []).map((row) => ({
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 1000) / 10,
    position: Math.round(row.position * 10) / 10,
  }))
}

export interface GscTrendPoint {
  date: string
  clicks: number
  impressions: number
}

export async function getClicksTrend(
  accessToken: string,
  propertyUrl: string,
  days = 30
): Promise<GscTrendPoint[]> {
  const endDate = new Date().toISOString().slice(0, 10)
  const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

  const res = await fetch(
    `${GSC_API_URL}/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['date'],
        rowLimit: 90,
      }),
    }
  )
  const data = await res.json() as {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number }>
  }
  return (data.rows ?? []).map((row) => ({
    date: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
  }))
}
