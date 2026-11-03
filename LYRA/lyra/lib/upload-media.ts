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

  const { uploadUrl, fields, publicUrl } = await presignRes.json() as {
    uploadUrl: string
    fields: Record<string, string>
    publicUrl: string
  }

  // Presigned POST, not PUT: the route now issues a POST policy so S3 itself
  // enforces the 50MB cap (see the content-length-range condition in
  // app/api/upload/presign/route.ts). The policy fields S3 returns must be
  // appended before the file, and the Content-Type field must stay exactly as
  // issued -- it is covered by the policy signature, so changing it here
  // makes S3 reject the upload. No explicit Content-Type header is set on the
  // request either: the browser sets the multipart boundary itself.
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  form.append('file', file)

  const uploadRes = await fetch(uploadUrl, { method: 'POST', body: form })
  if (!uploadRes.ok) {
    // S3 rejects an over-policy upload with 403 and an XML body, which is
    // what a file larger than the policy allows now looks like. The size is
    // already checked above, so this is the bypass path (a caller reaching
    // the route directly) rather than something a normal user hits.
    throw new Error('Upload to storage failed')
  }

  return publicUrl
}
