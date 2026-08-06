import { postLyraApi } from '../lyra-api-client'

interface CompleteMediaUploadParams {
  uploadId: string
}

interface CompleteMediaUploadResult {
  url: string
}

// No workspace_id resolution here -- the upload session created by
// start_media_upload already carries workspace context server-side (in
// Redis), and the backend route checks session ownership by user id, not a
// re-supplied workspace id.
export async function completeMediaUpload(params: CompleteMediaUploadParams, bearerToken: string) {
  return postLyraApi<CompleteMediaUploadResult>('/api/upload/multipart/complete', bearerToken, {
    uploadId: params.uploadId,
  })
}
