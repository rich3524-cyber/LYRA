const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const API_URL = 'https://api.linkedin.com/v2'

// Community Management API scopes (Development Tier — approved 2026-06)
const SCOPES = [
  'openid',
  'profile',
  'email',
  'w_member_social',
  'r_organization_social',
  'w_organization_social',
  'r_organization_social_feed',
  'w_organization_social_feed',
  'rw_organization_admin',
].join(' ')

const RESTLI_HEADERS = {
  'X-Restli-Protocol-Version': '2.0.0',
}

export interface LinkedInOrg {
  id: string
  name: string
  logoUrl?: string
}

export interface LinkedInPost {
  urn: string
}

export interface LinkedInComment {
  commentUrn: string  // full URN: "urn:li:comment:(urn:li:ugcPost:{postId},{commentId})"
  postUrn: string     // parent post URN
  actorUrn: string    // commenter's person/org URN
  text: string
  createdAt: number   // epoch ms
}

export function getAuthUrl(workspaceId: string): string {
  const state = Buffer.from(JSON.stringify({ workspaceId })).toString('base64')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/linkedin`,
    scope: SCOPES,
    state,
  })
  return `${AUTH_URL}?${params}`
}

export async function exchangeCode(code: string): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.APP_BASE_URL}/api/social/callback/linkedin`,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description ?? data.error)
  return { accessToken: data.access_token as string, expiresIn: data.expires_in as number }
}

export async function getProfile(accessToken: string): Promise<{ id: string; name: string }> {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  return {
    id: data.sub as string,
    name: (data.name ?? `${data.given_name ?? ''} ${data.family_name ?? ''}`.trim()) as string,
  }
}

export async function getOrganizations(accessToken: string, memberId: string): Promise<LinkedInOrg[]> {
  const res = await fetch(
    `${API_URL}/organizationAcls?q=roleAssignee&roleAssignee=urn:li:person:${memberId}&state=APPROVED`,
    { headers: { Authorization: `Bearer ${accessToken}`, ...RESTLI_HEADERS } }
  )
  const data = await res.json()
  if (!data.elements) return []

  const orgs: LinkedInOrg[] = []
  for (const element of data.elements) {
    const orgUrn: string = element.organization
    const orgId = orgUrn.split(':').pop()!
    const orgRes = await fetch(
      `${API_URL}/organizations/${orgId}?projection=(id,localizedName,logoV2(original~:playableStreams))`,
      { headers: { Authorization: `Bearer ${accessToken}`, ...RESTLI_HEADERS } }
    )
    const org = await orgRes.json()
    orgs.push({
      id: String(org.id),
      name: org.localizedName as string,
      logoUrl: org.logoV2?.['original~']?.elements?.[0]?.identifiers?.[0]?.identifier as string | undefined,
    })
  }
  return orgs
}

// Fetch recent posts published by an organization page.
// Returns up to 20 posts sorted by most recently modified.
export async function getOrgPosts(accessToken: string, orgId: string): Promise<LinkedInPost[]> {
  const encodedOrgUrn = encodeURIComponent(`urn:li:organization:${orgId}`)
  const res = await fetch(
    `${API_URL}/ugcPosts?q=authors&authors=List(${encodedOrgUrn})&count=20&sortBy=LAST_MODIFIED`,
    { headers: { Authorization: `Bearer ${accessToken}`, ...RESTLI_HEADERS } }
  )
  if (!res.ok) return []
  const data = await res.json() as { elements?: Array<{ id?: string }> }
  return (data.elements ?? [])
    .map((el) => ({ urn: el.id ?? '' }))
    .filter((p) => p.urn)
}

// Fetch comments on a specific post URN.
// Stores the full comment URN (including post context) so replies can be made without extra lookups.
export async function getPostComments(accessToken: string, postUrn: string): Promise<LinkedInComment[]> {
  const encodedPostUrn = encodeURIComponent(postUrn)
  const res = await fetch(
    `${API_URL}/socialActions/${encodedPostUrn}/comments?count=50`,
    { headers: { Authorization: `Bearer ${accessToken}`, ...RESTLI_HEADERS } }
  )
  if (!res.ok) return []
  const data = await res.json() as {
    elements?: Array<{
      id?: string
      actor?: string
      created?: { time?: number }
      message?: { text?: string }
      object?: string
    }>
  }

  return (data.elements ?? [])
    .map((el) => {
      const commentId = el.id ?? ''
      const parentUrn = el.object ?? postUrn
      return {
        commentUrn: `urn:li:comment:(${parentUrn},${commentId})`,
        postUrn: parentUrn,
        actorUrn: el.actor ?? '',
        text: el.message?.text ?? '',
        createdAt: el.created?.time ?? Date.now(),
      }
    })
    .filter((c) => c.text && c.commentUrn)
}

// Post a reply to a LinkedIn comment on behalf of an organization.
// commentUrn: the full "urn:li:comment:(urn:li:ugcPost:{postId},{commentId})" stored as platformCommentId.
export async function postCommentReply(
  accessToken: string,
  commentUrn: string,
  orgId: string,
  text: string
): Promise<void> {
  const encodedUrn = encodeURIComponent(commentUrn)
  const res = await fetch(`${API_URL}/socialActions/${encodedUrn}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...RESTLI_HEADERS,
    },
    body: JSON.stringify({
      actor: `urn:li:organization:${orgId}`,
      message: { text },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; serviceErrorCode?: number }
    throw new Error(`LinkedIn reply failed (${res.status}): ${err.message ?? 'Unknown error'}`)
  }
}
