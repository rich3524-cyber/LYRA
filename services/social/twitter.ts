import crypto from 'crypto'

const AUTH_URL = 'https://twitter.com/i/oauth2/authorize'
const TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const API_URL = 'https://api.twitter.com/2'

const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'].join(' ')

export interface TwitterAccount {
  id: string
  name: string
  username: string
  avatarUrl?: string
  accessToken: string
  refreshToken: string
  tokenExpiry: Date
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

export function getAuthUrl(workspaceId: string): { url: string; codeVerifier: string } {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  // codeVerifier stored in state so we can retrieve it in the callback
  const state = Buffer.from(JSON.stringify({ workspaceId, codeVerifier })).toString('base64')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.TWITTER_CLIENT_ID!,
    redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/twitter`,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return { url: `${AUTH_URL}?${params}`, codeVerifier }
}

export async function exchangeCode(
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const credentials = Buffer.from(
    `${process.env.TWITTER_CLIENT_ID!}:${process.env.TWITTER_CLIENT_SECRET!}`
  ).toString('base64')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/twitter`,
      code_verifier: codeVerifier,
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

export async function getUser(accessToken: string): Promise<{ id: string; name: string; username: string; avatarUrl?: string }> {
  const res = await fetch(`${API_URL}/users/me?user.fields=profile_image_url`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (data.errors) throw new Error(data.errors[0]?.detail ?? 'Twitter API error')
  const user = data.data
  return {
    id: user.id as string,
    name: user.name as string,
    username: user.username as string,
    avatarUrl: user.profile_image_url as string | undefined,
  }
}
