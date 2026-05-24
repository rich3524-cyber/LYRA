const BASE_URL = 'https://graph.facebook.com/v19.0'
const DIALOG_URL = 'https://www.facebook.com/v19.0/dialog/oauth'
const TIMEOUT_MS = 10_000

const SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_manage_engagement',
  'pages_manage_metadata',
  'pages_read_user_content',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'ads_management',
].join(',')

export interface FacebookPage {
  id: string
  name: string
  accessToken: string
  avatarUrl?: string
}

export function getAuthUrl(workspaceId: string, rerequest = false): string {
  const state = Buffer.from(JSON.stringify({ workspaceId })).toString('base64')
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID!,
    redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/facebook`,
    scope: SCOPES,
    state,
    response_type: 'code',
    ...(rerequest && { auth_type: 'rerequest' }),
  })
  return `${DIALOG_URL}?${params}`
}

export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/oauth/access_token?` +
    new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID!,
      client_secret: process.env.FACEBOOK_APP_SECRET!,
      redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/facebook`,
      code,
    }),
    { signal: AbortSignal.timeout(TIMEOUT_MS) }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.access_token as string
}

export async function getLongLivedToken(shortToken: string): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/oauth/access_token?` +
    new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: process.env.FACEBOOK_APP_ID!,
      client_secret: process.env.FACEBOOK_APP_SECRET!,
      fb_exchange_token: shortToken,
    }),
    { signal: AbortSignal.timeout(TIMEOUT_MS) }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.access_token as string
}

export async function getPages(userAccessToken: string): Promise<FacebookPage[]> {
  const res = await fetch(
    `${BASE_URL}/me/accounts?fields=id,name,access_token,picture&access_token=${userAccessToken}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return (data.data ?? []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    name: p.name as string,
    accessToken: p.access_token as string,
    avatarUrl: (p.picture as { data?: { url?: string } } | undefined)?.data?.url,
  }))
}

export async function fetchAdAccountId(accessToken: string): Promise<string | null> {
  const res = await fetch(
    `${BASE_URL}/me/adaccounts?fields=id,account_status&access_token=${accessToken}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) }
  )
  const data = await res.json() as { data?: { id: string; account_status: number }[]; error?: { message: string } }
  if (data.error) return null
  // account_status 1 = ACTIVE
  const active = (data.data ?? []).find((a) => a.account_status === 1)
  return active ? active.id.replace('act_', '') : null
}

export async function replyToComment(
  platformCommentId: string,
  message: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${BASE_URL}/${platformCommentId}/comments`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message, access_token: accessToken }),
    signal:  AbortSignal.timeout(TIMEOUT_MS),
  })
  const data = await res.json() as { id?: string; error?: { message: string } }
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `Facebook API error: ${res.status}`)
}
