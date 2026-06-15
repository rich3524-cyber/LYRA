const AUTH_URL = 'https://accounts.google.com/o/oauth2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels'

const SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.upload',
].join(' ')

export interface YouTubeChannel {
  id: string
  name: string
  handle: string
  avatarUrl: string | null
  accessToken: string
  refreshToken: string
  tokenExpiry: Date
}

export function getAuthUrl(workspaceId: string): string {
  const state = Buffer.from(JSON.stringify({ workspaceId })).toString('base64')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/youtube`,
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
      redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/youtube`,
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

export async function getChannel(
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<YouTubeChannel> {
  const params = new URLSearchParams({
    part: 'id,snippet',
    mine: 'true',
  })
  const res = await fetch(`${CHANNELS_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  const channel = data.items?.[0]
  if (!channel) throw new Error('No YouTube channel found for this account')

  return {
    id: channel.id as string,
    name: channel.snippet.title as string,
    handle: (channel.snippet.customUrl ?? channel.id) as string,
    avatarUrl: (channel.snippet.thumbnails?.default?.url as string) ?? null,
    accessToken,
    refreshToken,
    tokenExpiry: new Date(Date.now() + expiresIn * 1000),
  }
}
