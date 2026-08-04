import { callLyraApi } from '../lyra-api-client'
import { wrapUntrusted } from '../untrusted-content'

interface Comment {
  id: string
  content: string
  status: string
  socialAccount: { platform: string; name: string }
}

interface ListInboxItemsParams {
  workspace_id: string
}

// This is the first tool that surfaces third-party content (Instagram/Facebook
// comments) into Claude's context. Comments are hostile, untrusted,
// user-generated text -- every comment's `content` field MUST go through
// wrapUntrusted before being returned, or this becomes a real
// prompt-injection vector rather than a style nit.
export async function listInboxItems(params: ListInboxItemsParams, bearerToken: string) {
  if (!params.workspace_id) throw new Error('workspace_id is required')

  const comments = await callLyraApi<Comment[]>('/api/comments', bearerToken, {
    workspaceId: params.workspace_id,
  })

  return {
    items: comments.map((c) => ({
      id: c.id,
      content: wrapUntrusted(c.content, `${c.socialAccount.platform.toLowerCase()}_comment`),
      status: c.status,
      platform: c.socialAccount.platform,
      accountName: c.socialAccount.name,
    })),
  }
}
