'use client'

import { useState } from 'react'
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
import { toast } from 'sonner'

export function DeleteAccountButton() {
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete account')
      window.location.href = '/auth/logout'
    } catch {
      toast.error('Failed to delete account. Contact support if this persists.')
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger className="inline-flex items-center px-3 py-1.5 rounded-lg border border-status-error/50 font-sans text-xs text-status-error hover:bg-status-error/10 transition-colors duration-150">
        Delete account
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-background-tertiary border-background-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-sans font-medium text-text-primary">
            Delete account?
          </AlertDialogTitle>
          <AlertDialogDescription className="font-sans text-sm text-text-secondary">
            This permanently deletes your account, all workspaces, posts, and brand profiles. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="font-sans text-xs bg-transparent border-background-border-mid text-text-secondary hover:text-text-primary">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="font-sans text-xs bg-status-error text-white hover:bg-status-error/80"
          >
            {isDeleting ? 'Deleting…' : 'Delete account'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
