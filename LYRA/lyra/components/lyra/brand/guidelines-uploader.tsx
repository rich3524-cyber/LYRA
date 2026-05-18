'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { Trash2, FileText, Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  workspaceId: string
  guidelineUrls: string[]  // S3 keys, e.g. "guidelines/wid/1234-filename.pdf"
}

function keyToFilename(key: string): string {
  const parts = key.split('/')
  const last  = parts[parts.length - 1] ?? key
  // Strip the timestamp prefix: "1716000000000-my-doc.pdf" → "my-doc.pdf"
  return last.replace(/^\d+-/, '')
}

export function GuidelinesUploader({ workspaceId, guidelineUrls }: Props) {
  const router  = useRouter()
  const [uploading, setUploading]       = useState(false)
  const [deleting, setDeleting]         = useState<string | null>(null)
  const [uploadError, setUploadError]   = useState<string | null>(null)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return
    const file = acceptedFiles[0]

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5 MB')
      return
    }

    setUploadError(null)
    setUploading(true)

    try {
      // Step 1: Get presigned URL
      const presignRes = await fetch('/api/brand-intelligence/guidelines/presigned', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, filename: file.name, contentType: file.type }),
      })
      if (!presignRes.ok) {
        const data = await presignRes.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'Failed to get upload URL')
      }
      const { uploadUrl, key } = await presignRes.json() as { uploadUrl: string; key: string }

      // Step 2: Upload directly to S3
      const s3Res = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      })
      if (!s3Res.ok) throw new Error('Upload to storage failed')

      // Step 3: Save key to DB
      const saveRes = await fetch('/api/brand-intelligence/guidelines', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, key }),
      })
      if (!saveRes.ok) throw new Error('Failed to save file reference')

      toast.success(`${file.name} uploaded`)
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setUploadError(msg)
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }, [workspaceId, router])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf':                                                                      ['.pdf'],
      'text/plain':                                                                            ['.txt'],
      'text/markdown':                                                                         ['.md'],
      'application/msword':                                                                    ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':              ['.docx'],
    },
    maxFiles: 1,
    disabled: uploading,
  })

  async function handleDelete(key: string) {
    setDeleting(key)
    try {
      const res = await fetch('/api/brand-intelligence/guidelines', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, key }),
      })
      if (!res.ok) throw new Error('Delete failed')
      toast.success('File removed')
      router.refresh()
    } catch {
      toast.error('Failed to remove file')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Existing files */}
      {guidelineUrls.length > 0 && (
        <ul className="space-y-1">
          {guidelineUrls.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-background-tertiary border border-background-border"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={12} strokeWidth={1.5} className="text-text-tertiary shrink-0" />
                <span className="font-sans text-xs text-text-secondary truncate">
                  {keyToFilename(key)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(key)}
                disabled={deleting === key}
                aria-label="Remove file"
                className="text-text-tertiary hover:text-status-error transition-colors shrink-0 disabled:opacity-40"
              >
                {deleting === key
                  ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                  : <Trash2 size={12} strokeWidth={1.5} />
                }
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          'border border-dashed border-background-border rounded-xl p-6 text-center cursor-pointer transition-colors',
          isDragActive && 'border-accent-platinum bg-background-hover',
          uploading && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          {uploading ? (
            <Loader2 size={16} strokeWidth={1.5} className="text-text-tertiary animate-spin" />
          ) : (
            <Upload size={16} strokeWidth={1.5} className="text-text-tertiary" />
          )}
          <p className="font-sans text-xs text-text-tertiary">
            {uploading
              ? 'Uploading…'
              : isDragActive
              ? 'Drop file here'
              : 'Drop a PDF, TXT, or DOCX — or click to browse'}
          </p>
          <p className="font-sans text-[10px] text-text-tertiary">Max 5 MB</p>
        </div>
      </div>

      {uploadError && (
        <p className="font-sans text-xs text-status-error">{uploadError}</p>
      )}
    </div>
  )
}
