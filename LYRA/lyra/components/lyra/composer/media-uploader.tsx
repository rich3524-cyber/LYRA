'use client'

import { useRef, useState } from 'react'
import { Image as ImageIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface MediaUploaderProps {
  workspaceId: string
  onUpload: (url: string) => void
}

export function MediaUploader({ workspaceId, onUpload }: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
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

      onUpload(publicUrl)
    } catch {
      toast.error('Failed to upload media')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
        aria-label="Attach media"
      >
        {uploading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <ImageIcon size={14} />
        )}
        {uploading ? 'Uploading…' : 'Media'}
      </button>
    </>
  )
}
