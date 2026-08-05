import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getWorkspaceName } from '../get-workspace-name'

interface DraftPostParams {
  workspace_id?: string
  content: string
  platforms: string[]
}

interface ContentScore {
  overallScore: number
  dimensions: Record<string, { score: number; suggestion: string | null }>
}

interface CreatedPost {
  id: string
  status: string
  socialAccount: { platform: string; name: string }
}

// Score is informational, not gating -- the post is always created
// regardless of score, matching the parent spec's tool description
// ("Create a draft, return the six-dimension content score").
export async function draftPost(params: DraftPostParams, bearerToken: string) {
  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)

  const [score, workspaceName, posts] = await Promise.all([
    postLyraApi<ContentScore>('/api/ai/score-content', bearerToken, {
      content: params.content,
      platform: params.platforms[0],
      workspaceId: workspace_id,
    }),
    getWorkspaceName(workspace_id, bearerToken),
    postLyraApi<CreatedPost[]>('/api/posts', bearerToken, {
      workspaceId: workspace_id,
      content: params.content,
      platforms: params.platforms,
      status: 'DRAFT',
    }),
  ])

  return {
    workspaceName,
    posts: posts.map((p) => ({
      id: p.id,
      status: p.status,
      platform: p.socialAccount.platform,
      accountName: p.socialAccount.name,
    })),
    score,
  }
}
