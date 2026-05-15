'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface Props {
  workspaceId: string
  workspaceName: string
}

export function DeleteWorkspaceButton({ workspaceId, workspaceName }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      await fetch(`/api/workspaces/${workspaceId}`, { method: 'DELETE' })
      router.push('/')
    } catch {
      setLoading(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-status-error text-status-error font-sans text-sm hover:bg-status-error hover:text-background-primary transition-all duration-150"
          aria-label="Delete workspace"
        >
          <Trash2 size={14} strokeWidth={1.5} />
          Delete workspace
        </button>
      </AlertDialogTrigger>

      <AlertDialogContent className="bg-background-secondary border border-background-border-mid rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-sans text-base font-medium text-text-primary">
            Delete {workspaceName}?
          </AlertDialogTitle>
          <AlertDialogDescription className="font-sans text-sm text-text-secondary leading-relaxed">
            This will permanently delete the workspace, all connected social accounts, scheduled
            posts, and brand profile. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="font-sans text-sm bg-background-tertiary border-background-border-mid text-text-secondary hover:text-text-primary">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="font-sans text-sm bg-status-error text-background-primary hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Deleting…' : 'Delete workspace'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
