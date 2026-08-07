import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'

interface AttachMediaParams {
  workspace_id?: string
  source_url: string
}

interface AttachMediaResult {
  url: string
}

export async function attachMedia(params: AttachMediaParams, bearerToken: string): Promise<AttachMediaResult> {
  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)

  return postLyraApi<AttachMediaResult>('/api/upload/from-url', bearerToken, {
    workspaceId: workspace_id,
    sourceUrl: params.source_url,
  })
}
