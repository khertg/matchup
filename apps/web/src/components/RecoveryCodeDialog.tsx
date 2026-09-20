import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface Props {
  /** The code to show, or null when the dialog is closed. */
  code: string | null
  /** Called once the person confirms they have saved it. */
  onDone: () => void
}

/**
 * Shows a club's one-time recovery code. It cannot be dismissed by accident:
 * the code is never shown again, and it is the only way back in if the password is lost.
 */
export function RecoveryCodeDialog({ code, onDone }: Props) {
  const [saved, setSaved] = useState(false)

  async function copy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      toast('Recovery code copied')
    } catch {
      toast.error('Could not copy. Select the code and copy it by hand.')
    }
  }

  return (
    <Dialog open={code !== null}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Save your recovery code</DialogTitle>
          <DialogDescription>
            If you forget the club password, this code is the only way back in. It is shown just once,
            so write it down or keep it in a password manager.
          </DialogDescription>
        </DialogHeader>

        <p
          aria-label="Recovery code"
          className="rounded-lg border bg-muted px-3 py-4 text-center font-mono text-xl tracking-wider select-all"
        >
          {code}
        </p>
        <Button type="button" variant="outline" onClick={copy}>
          Copy code
        </Button>

        <div className="flex items-start gap-2">
          <input
            id="recovery-saved"
            type="checkbox"
            className="mt-1 size-4"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
          />
          <Label htmlFor="recovery-saved" className="font-normal">
            I have saved this code somewhere safe
          </Label>
        </div>

        <DialogFooter>
          <Button
            className="h-11 w-full"
            disabled={!saved}
            onClick={() => {
              setSaved(false)
              onDone()
            }}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
