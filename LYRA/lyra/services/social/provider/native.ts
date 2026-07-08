import type { SocialAccount } from '@prisma/client'
import { decrypt } from '@/lib/encrypt'
import { publishPost as publishFacebookPost } from '../facebook'
import type { PublishInput, SocialProvider } from './types'
import { ProviderUnsupported } from './types'

function requireAccessToken(account: SocialAccount): string {
  if (!account.accessToken) {
    throw new Error(`SocialAccount ${account.id} has no accessToken set`)
  }
  return decrypt(account.accessToken)
}

async function publishToInstagram(
  igId: string,
  content: string,
  accessToken: string,
  mediaUrls?: string[],
): Promise<string> {
  const createRes = await fetch(`https://graph.facebook.com/v19.0/${igId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: mediaUrls?.[0] ?? 'https://picsum.photos/1080/1080.jpg',
      caption: content,
      access_token: accessToken,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const createData = (await createRes.json()) as { id?: string; error?: { message: string } }
  if (!createRes.ok || createData.error || !createData.id) {
    throw new Error(createData.error?.message ?? `Instagram container error: ${createRes.status}`)
  }

  const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: createData.id, access_token: accessToken }),
    signal: AbortSignal.timeout(15_000),
  })
  const publishData = (await publishRes.json()) as { id?: string; error?: { message: string } }
  if (!publishRes.ok || publishData.error || !publishData.id) {
    throw new Error(publishData.error?.message ?? `Instagram publish error: ${publishRes.status}`)
  }
  return publishData.id
}

async function publishToLinkedin(orgId: string, content: string, accessToken: string): Promise<string> {
  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author: `urn:li:organization:${orgId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const platformPostId = res.headers.get('x-restli-id')
  if (!res.ok || !platformPostId) {
    const errorBody = (await res.json().catch(() => null)) as { message?: string } | null
    throw new Error(errorBody?.message ?? `LinkedIn publish error: ${res.status}`)
  }
  return platformPostId
}

async function publishToTwitter(content: string, accessToken: string): Promise<string> {
  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: content }),
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json()) as { data?: { id?: string }; detail?: string }
  if (!res.ok || !data.data?.id) {
    throw new Error(data.detail ?? `Twitter publish error: ${res.status}`)
  }
  return data.data.id
}

// Native path stays intact for per-platform pivot-back. Comments/reviews are
// wired to the existing services/social/*.ts in a later phase; reviews are
// unsupported natively (GBP native path was rejected — see the design spec).
export const nativeProvider: SocialProvider = {
  async publish(account, input: PublishInput) {
    const accessToken = requireAccessToken(account)
    switch (account.platform) {
      case 'FACEBOOK':
        return { platformPostId: await publishFacebookPost(account.platformId, input.content, accessToken) }
      case 'INSTAGRAM':
        return {
          platformPostId: await publishToInstagram(account.platformId, input.content, accessToken, input.mediaUrls),
        }
      case 'LINKEDIN':
        return { platformPostId: await publishToLinkedin(account.platformId, input.content, accessToken) }
      case 'TWITTER':
        return { platformPostId: await publishToTwitter(input.content, accessToken) }
      default:
        throw new ProviderUnsupported('publish', account.platform)
    }
  },
  async fetchRecentComments(account) {
    throw new ProviderUnsupported('fetchRecentComments', account.platform)
  },
  async replyToComment(account) {
    throw new ProviderUnsupported('replyToComment', account.platform)
  },
  async fetchReviews(account) {
    throw new ProviderUnsupported('fetchReviews', account.platform)
  },
  async replyToReview(account) {
    throw new ProviderUnsupported('replyToReview', account.platform)
  },
}
