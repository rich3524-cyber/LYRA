// The only file-size gate that actually runs -- every real upload goes through
// this function. Without this, a large file's only failure mode was the
// presigned URL's 5-minute expiry silently killing a slow upload partway
// through, discarded into a generic "Failed to upload media" toast.
export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

export async function uploadMediaFile(file: File, workspaceId: string): Promise<string> {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    throw new Error(`File too large (${mb}MB) -- max 50MB`)
  }

  const presignRes = await fetch('/api/upload/presign', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, workspaceId }),
  })
  if (!presignRes.ok) {
    const data = await presignRes.json().catch(() => null) as { error?: string } | null
    throw new Error(data?.error ?? 'Failed to get upload URL')
  }

  const { presignedUrl, publicUrl } = await presignRes.json() as {
    presignedUrl: string
    publicUrl: string
  }

  const uploadRes = await fetch(presignedUrl, {
    method:  'PUT',
    headers: { 'Content-Type': file.type },
    body:    file,
  })
  if (!uploadRes.ok) throw new Error('Upload to storage failed')

  return publicUrl
}
