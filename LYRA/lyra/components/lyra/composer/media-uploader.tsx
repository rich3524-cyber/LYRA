'use client'

import { useRef, useState } from 'react'
import { Image as ImageIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { uploadMediaFile } from '@/lib/upload-media'

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
      const publicUrl = await uploadMediaFile(file, workspaceId)
      onUpload(publicUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload media')
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
