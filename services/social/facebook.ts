const BASE_URL = 'https://graph.facebook.com/v19.0'
const DIALOG_URL = 'https://www.facebook.com/v19.0/dialog/oauth'

const SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
].join(',')

export interface FacebookPage {
  id: string
  name: string
  accessToken: string
  avatarUrl?: string
}

export function getAuthUrl(workspaceId: string): string {
  const state = Buffer.from(JSON.stringify({ workspaceId })).toString('base64')
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID!,
    redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/facebook`,
    scope: SCOPES,
    state,
    response_type: 'code',
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
    })
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
    })
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.access_token as string
}

export async function getPages(userAccessToken: string): Promise<FacebookPage[]> {
  const res = await fetch(
    `${BASE_URL}/me/accounts?fields=id,name,access_token,picture&access_token=${userAccessToken}`
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

export async function replyToComment(
  commentId: string,
  message: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${BASE_URL}/${commentId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
}
