const AUTH_URL = 'https://accounts.google.com/o/oauth2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts'
const LOCATIONS_URL = 'https://mybusinessbusinessinformation.googleapis.com/v1'

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
].join(' ')

export interface GoogleLocation {
  id: string
  name: string
  accessToken: string
  refreshToken: string
  tokenExpiry: Date
}

export function getAuthUrl(workspaceId: string): string {
  const state = Buffer.from(JSON.stringify({ workspaceId })).toString('base64')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/google`,
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${AUTH_URL}?${params}`
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
}> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/google`,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description ?? data.error)
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresIn: data.expires_in as number,
  }
}

export async function getLocations(
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<GoogleLocation[]> {
  const accountsRes = await fetch(ACCOUNTS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const accountsData = await accountsRes.json()
  const accounts: { name: string; accountName: string }[] = accountsData.accounts ?? []

  const tokenExpiry = new Date(Date.now() + expiresIn * 1000)
  const locations: GoogleLocation[] = []

  for (const account of accounts) {
    const locRes = await fetch(`${LOCATIONS_URL}/${account.name}/locations?readMask=name,title`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const locData = await locRes.json()
    for (const loc of locData.locations ?? []) {
      locations.push({
        id: loc.name as string,
        name: (loc.title ?? account.accountName) as string,
        accessToken,
        refreshToken,
        tokenExpiry,
      })
    }
  }

  return locations
}
