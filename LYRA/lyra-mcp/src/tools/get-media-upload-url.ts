import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'

interface GetMediaUploadUrlParams {
  workspace_id?: string
  contentType: string
}

interface GetMediaUploadUrlResult {
  uploadUrl: string
  fields: Record<string, string>
  publicUrl: string
}

export async function getMediaUploadUrl(params: GetMediaUploadUrlParams, bearerToken: string): Promise<GetMediaUploadUrlResult> {
  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)

  return postLyraApi<GetMediaUploadUrlResult>('/api/upload/media-presign', bearerToken, {
    workspaceId: workspace_id,
    contentType: params.contentType,
  })
}
