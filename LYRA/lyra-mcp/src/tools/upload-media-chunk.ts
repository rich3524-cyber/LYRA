import { putLyraApi } from '../lyra-api-client'

interface UploadMediaChunkParams {
  uploadId: string
  chunkIndex: number
  data: string
}

interface UploadMediaChunkResult {
  received: true
  chunkIndex: number
}

// No workspace_id resolution here -- the upload session created by
// start_media_upload already carries workspace context server-side (in
// Redis), and the backend route checks session ownership by user id, not a
// re-supplied workspace id.
export async function uploadMediaChunk(params: UploadMediaChunkParams, bearerToken: string) {
  return putLyraApi<UploadMediaChunkResult>('/api/upload/multipart/part', bearerToken, {
    uploadId: params.uploadId,
    chunkIndex: params.chunkIndex,
    data: params.data,
  })
}
