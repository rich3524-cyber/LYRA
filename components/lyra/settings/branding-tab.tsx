'use client'

import { useState, useRef } from 'react'
import { Upload, X } from 'lucide-react'

interface BrandingTabProps {
  workspaceId: string
  hasLogo: boolean
}

export function BrandingTab({ workspaceId, hasLogo: initialHasLogo }: BrandingTabProps) {
  const [hasLogo, setHasLogo] = useState(initialHasLogo)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setError(null)
    setSuccess(null)

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('File must be PNG or JPG.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be under 2MB.')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('logo', file)
      const res = await fetch(`/api/workspaces/${workspaceId}/logo`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Upload failed.')
        return
      }
      setHasLogo(true)
      setSuccess('Logo uploaded.')
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleRemove() {
    setError(null)
    setSuccess(null)
    setIsRemoving(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/logo`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Remove failed.')
        return
      }
      setHasLogo(false)
      setSuccess('Logo removed.')
    } catch {
      setError('Remove failed. Please try again.')
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-sans text-sm font-medium text-text-primary mb-1">Client Logo</h3>
        <p className="font-sans text-xs text-text-secondary">
          Used in PDF report exports alongside the LYRA mark. PNG or JPG. Max 2MB.
        </p>
      </div>

      {hasLogo ? (
        <div className="flex items-center gap-3 p-4 bg-background-secondary border border-background-border rounded-xl">
          <div className="w-2 h-2 rounded-full bg-status-success shrink-0" />
          <span className="font-sans text-sm text-text-primary flex-1">Logo uploaded</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isRemoving}
            className="font-sans text-xs text-text-secondary hover:text-text-primary transition-colors duration-150 disabled:opacity-50"
          >
            Replace
          </button>
          <button
            onClick={handleRemove}
            disabled={isUploading || isRemoving}
            className="font-sans text-xs text-status-error hover:text-status-error/80 transition-colors duration-150 disabled:opacity-50 flex items-center gap-1"
          >
            <X size={12} strokeWidth={1.5} />
            Remove
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-2 px-4 py-2.5 bg-background-secondary border border-background-border rounded-xl font-sans text-sm text-text-secondary hover:text-text-primary hover:border-background-border-mid transition-colors duration-150 disabled:opacity-50"
        >
          <Upload size={16} strokeWidth={1.5} />
          {isUploading ? 'Uploading…' : 'Upload logo'}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
          e.target.value = ''
        }}
      />

      {error && <p className="font-sans text-xs text-status-error">{error}</p>}
      {success && <p className="font-sans text-xs text-status-success">{success}</p>}
    </div>
  )
}
