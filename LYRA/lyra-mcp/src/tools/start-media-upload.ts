import { postLyraApi } from '../lyra-api-client'
import { resolveWorkspaceId } from '../resolve-workspace-id'

interface StartMediaUploadParams {
  workspace_id?: string
  filename: string
  contentType: string
  totalSizeBytes: number
}

interface StartMediaUploadResult {
  uploadId: string
  chunkSizeBytes: number
}

export async function startMediaUpload(params: StartMediaUploadParams, bearerToken: string) {
  const workspace_id = await resolveWorkspaceId(params.workspace_id, bearerToken)

  return postLyraApi<StartMediaUploadResult>('/api/upload/multipart/start', bearerToken, {
    workspaceId: workspace_id,
    filename: params.filename,
    contentType: params.contentType,
    totalSizeBytes: params.totalSizeBytes,
  })
}
