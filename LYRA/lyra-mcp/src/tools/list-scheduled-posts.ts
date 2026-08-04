import { callLyraApi } from '../lyra-api-client'

interface Post {
  id: string
  content: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  failureReason: string | null
  socialAccount: { platform: string; name: string }
}

interface ListScheduledPostsParams {
  workspace_id: string
  status?: string
  month?: string
}

export async function listScheduledPosts(params: ListScheduledPostsParams, bearerToken: string) {
  if (!params.workspace_id) throw new Error('workspace_id is required')

  const queryParams: Record<string, string> = { workspaceId: params.workspace_id }
  if (params.status) queryParams.status = params.status
  if (params.month) queryParams.month = params.month

  const posts = await callLyraApi<Post[]>('/api/posts', bearerToken, queryParams)

  return {
    posts: posts.map((p) => ({
      id: p.id,
      content: p.content,
      status: p.status,
      scheduledAt: p.scheduledAt,
      publishedAt: p.publishedAt,
      failureReason: p.failureReason,
      platform: p.socialAccount.platform,
      accountName: p.socialAccount.name,
    })),
  }
}
