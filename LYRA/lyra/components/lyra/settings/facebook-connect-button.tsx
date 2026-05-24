'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface FacebookConnectButtonProps {
  workspaceId: string
  isReconnect?: boolean
}

export function FacebookConnectButton({ workspaceId, isReconnect = false }: FacebookConnectButtonProps) {
  const [open, setOpen] = useState(false)

  const connectUrl = `/api/social/connect/facebook?workspaceId=${workspaceId}${isReconnect ? '&rerequest=true' : ''}`

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="border-background-border-mid text-text-secondary hover:text-text-primary hover:bg-background-hover"
        onClick={() => setOpen(true)}
      >
        {isReconnect ? 'Reconnect' : 'Connect'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-background-secondary border-background-border max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-status-warning/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-status-warning" strokeWidth={1.5} />
              </div>
              <DialogTitle className="text-text-primary font-sans font-medium text-base">
                Before connecting Facebook
              </DialogTitle>
            </div>
            <DialogDescription className="text-text-secondary font-sans text-sm leading-relaxed">
              Facebook will ask which Pages and permissions to share with LYRA.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-text-primary font-sans text-sm leading-relaxed">
              On the next screen, leave every permission and every Page checkbox turned on.
            </p>
            <div className="rounded-xl bg-background-tertiary border border-background-border p-4 space-y-2">
              <p className="text-text-secondary font-sans text-xs font-medium uppercase tracking-widest">
                If you turn any permission off
              </p>
              <p className="text-text-secondary font-sans text-sm leading-relaxed">
                LYRA will not be able to find or manage your Pages. You will need to disconnect and reconnect to fix it.
              </p>
            </div>
            <p className="text-text-tertiary font-sans text-xs leading-relaxed">
              If a Page is missing after connecting, go to Facebook Settings → Business Integrations → find LYRA → tick every Page.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-text-secondary hover:text-text-primary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-accent-platinum text-background-primary hover:bg-accent-white font-sans font-medium"
              onClick={() => { window.location.href = connectUrl }}
            >
              Continue to Facebook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
