const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const API_URL = 'https://api.linkedin.com/v2'

// Base scopes — available via "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" products
// After LinkedIn Community Management API is approved, add:
//   'r_organization_social', 'w_organization_social', 'rw_organization_admin'
const SCOPES = [
  'openid',
  'profile',
  'email',
  'w_member_social',
].join(' ')

export interface LinkedInOrg {
  id: string
  name: string
  logoUrl?: string
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
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  if (!data.elements) return []

  const orgs: LinkedInOrg[] = []
  for (const element of data.elements) {
    const orgUrn: string = element.organization
    const orgId = orgUrn.split(':').pop()!
    const orgRes = await fetch(
      `${API_URL}/organizations/${orgId}?projection=(id,localizedName,logoV2(original~:playableStreams))`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
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
