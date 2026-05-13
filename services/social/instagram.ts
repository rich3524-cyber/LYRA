const BASE_URL = 'https://graph.facebook.com/v19.0'

export interface InstagramAccount {
  id: string
  name: string
  username: string
  avatarUrl?: string
}

// Instagram Business Accounts are accessed via a connected Facebook Page.
// Given a page's access token, returns the linked IG Business Account (if any).
export async function getConnectedAccount(
  pageId: string,
  pageAccessToken: string
): Promise<InstagramAccount | null> {
  const res = await fetch(
    `${BASE_URL}/${pageId}?fields=instagram_business_account{id,name,username,profile_picture_url}&access_token=${pageAccessToken}`
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)

  const ig = data.instagram_business_account
  if (!ig) return null

  return {
    id: ig.id as string,
    name: (ig.name ?? ig.username) as string,
    username: ig.username as string,
    avatarUrl: ig.profile_picture_url as string | undefined,
  }
}
