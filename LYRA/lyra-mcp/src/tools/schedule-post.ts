import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'
import { getWorkspaceName } from '../get-workspace-name'

interface SchedulePostParams {
  workspace_id?: string
  content: string
  platforms: string[]
  scheduledAt: string
  media_urls?: string[]
}

interface CreatedPost {
  id: string
  status: string
  mediaUrls: string[]
  socialAccount: { platform: string; name: string }
}

// Always requests status: 'SCHEDULED' -- the LYRA API itself resolves the
// real final status server-side (SCHEDULED or PENDING_APPROVAL, depending
// on whether the workspace's client approval workflow is enabled). This
// tool truthfully reports back whatever the API actually decided, per the
// parent spec's "truthful write results" convention -- never assumes the
// requested status is what was actually granted.
export async function schedulePost(params: SchedulePostParams, bearerToken: string) {
  if (!params.scheduledAt) throw new Error('scheduledAt is required')
  const scheduledAtMs = Date.parse(params.scheduledAt)
  if (Number.isNaN(scheduledAtMs)) throw new Error('scheduledAt must be a valid ISO 8601 date-time')
  if (scheduledAtMs <= Date.now()) throw new Error('scheduledAt must be in the future')

  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)
  const [workspaceName, posts] = await Promise.all([
    getWorkspaceName(workspace_id, bearerToken),
    postLyraApi<CreatedPost[]>('/api/posts', bearerToken, {
      workspaceId: workspace_id,
      content: params.content,
      platforms: params.platforms,
      scheduledAt: params.scheduledAt,
      status: 'SCHEDULED',
      ...(params.media_urls ? { mediaUrls: params.media_urls } : {}),
    }),
  ])

  return {
    workspaceName,
    posts: posts.map((p) => ({
      id: p.id,
      status: p.status,
      // Included so the caller can confirm media actually attached without a
      // separate list_scheduled_posts round-trip -- get_media_upload_url's
      // upload step happens entirely outside this tool call, so this is the
      // only place a caller can verify the two actually connected.
      mediaUrls: p.mediaUrls,
      platform: p.socialAccount.platform,
      accountName: p.socialAccount.name,
    })),
  }
}
