export async function uploadMediaFile(file: File, workspaceId: string): Promise<string> {
  const presignRes = await fetch('/api/upload/presign', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ filename: file.name, contentType: file.type, workspaceId }),
  })
  if (!presignRes.ok) throw new Error('Failed to get upload URL')

  const { presignedUrl, publicUrl } = await presignRes.json() as {
    presignedUrl: string
    publicUrl: string
  }

  const uploadRes = await fetch(presignedUrl, {
    method:  'PUT',
    headers: { 'Content-Type': file.type },
    body:    file,
  })
  if (!uploadRes.ok) throw new Error('Upload failed')

  return publicUrl
}
