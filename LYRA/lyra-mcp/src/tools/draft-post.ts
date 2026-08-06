import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getWorkspaceName } from '../get-workspace-name'

interface DraftPostParams {
  workspace_id?: string
  content: string
  platforms: string[]
  media_urls?: string[]
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
    // Scoring is informational and must never block the write. /api/ai/score-content
    // rejects short content (<10 chars), rate-limits at 20/min, and can 503 if the
    // model call or its JSON parse fails -- none of which are reasons to withhold
    // an otherwise-valid draft the caller already asked us to create.
    postLyraApi<ContentScore>('/api/ai/score-content', bearerToken, {
      content: params.content,
      platform: params.platforms[0],
      workspaceId: workspace_id,
    }).then(
      (s) => s,
      () => null
    ),
    getWorkspaceName(workspace_id, bearerToken),
    postLyraApi<CreatedPost[]>('/api/posts', bearerToken, {
      workspaceId: workspace_id,
      content: params.content,
      platforms: params.platforms,
      status: 'DRAFT',
      ...(params.media_urls ? { mediaUrls: params.media_urls } : {}),
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
    // Scoring only ever reflects platforms[0] (see DraftPostParams handling
    // above) -- scoredForPlatform makes that explicit so a caller requesting
    // multiple platforms doesn't mistake a single-platform score for a
    // verdict on all of them (length bands differ materially by platform).
    score: score ? { ...score, scoredForPlatform: params.platforms[0] } : null,
  }
}
