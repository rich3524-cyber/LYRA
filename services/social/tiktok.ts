const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/'
const TOKEN_URL = 'https://open.tiktok.com/v2/oauth/token/'
const API_URL = 'https://open.tiktok.com/v2'

const SCOPES = ['user.info.basic', 'video.publish', 'video.upload'].join(',')

export interface TikTokAccount {
  id: string
  name: string
  avatarUrl?: string
  accessToken: string
  refreshToken: string
  tokenExpiry: Date
}

export function getAuthUrl(workspaceId: string): string {
  const state = Buffer.from(JSON.stringify({ workspaceId })).toString('base64')
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/tiktok`,
    state,
  })
  return `${AUTH_URL}?${params}`
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string
  refreshToken: string
  openId: string
  expiresIn: number
}> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/tiktok`,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description ?? data.error)
  return {
    accessToken: data.data.access_token as string,
    refreshToken: data.data.refresh_token as string,
    openId: data.data.open_id as string,
    expiresIn: data.data.expires_in as number,
  }
}

export async function getUser(
  accessToken: string,
  openId: string
): Promise<{ name: string; avatarUrl?: string }> {
  const res = await fetch(`${API_URL}/user/info/?fields=display_name,avatar_url`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message ?? 'TikTok API error')
  return {
    name: data.data.user.display_name as string,
    avatarUrl: data.data.user.avatar_url as string | undefined,
  }
}
