import { useState } from 'react'
import { recordAudit } from '@/cloud/audit'
import { useClubAuth } from '@/cloud/auth'
import { cloud } from '@/cloud/client'
import { countUnsent, flushAudit, sendEverythingNow } from '@/cloud/sync'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { db } from '@/db/db'
import { resetDevice, unsentChanges } from '@/lib/reset'

/** Time for the running session's own sender to catch up after "Try sending first". */
const SETTLE_MS = 1500

/**
 * Remove everything this device keeps and log out, as if the app were just installed. With a club, its
 * data on the server stays and comes back after logging in; the dialog lists anything not sent yet first.
 */
export function ResetDeviceDialog({ variant = 'outline' }: { variant?: 'outline' | 'ghost' }) {
  const club = useClubAuth((s) => s.club)
  const [open, setOpen] = useState(false)
  const [lost, setLost] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function check() {
    setLost(unsentChanges(await countUnsent()))
  }

  async function trySending() {
    setBusy(true)
    try {
      await sendEverythingNow()
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
      await check()
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true)
    const current = useClubAuth.getState().club
    if (current) {
      // The club's log says this device was reset, when it can still be told.
      recordAudit('deviceReset', 'Reset this device (removed everything kept on it)')
      await flushAudit().catch(() => false)
    }
    await resetDevice({
      storage: localStorage,
      deleteDatabase: () => db.delete(),
      logout: current && cloud ? () => cloud!.logout(current.token) : undefined,
    })
    window.location.reload()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setLost(null)
        if (next) void check()
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={variant} className={variant === 'ghost' ? 'w-full' : undefined}>
          Reset this device
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset this device?</DialogTitle>
          <DialogDescription>
            {club
              ? 'Removes everything saved on this device: saved players, past sessions, a running session, settings and the login. Your club’s data on the server is kept and comes back when you log in again.'
              : 'Removes everything saved on this device: saved players, past sessions, a running session and settings. This cannot be undone.'}
          </DialogDescription>
        </DialogHeader>

        {lost && lost.length > 0 && (
          <div role="alert" className="space-y-2 rounded-lg border border-destructive/50 p-3 text-sm">
            <p className="font-medium text-destructive">Not sent to the club yet, and lost if you reset now:</p>
            <ul className="list-disc pl-5">
              {lost.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={trySending}>
              {busy ? 'Sending…' : 'Try sending first'}
            </Button>
          </div>
        )}

        <DialogFooter className="sm:flex-col-reverse">
          <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" className="w-full" disabled={busy || lost === null} onClick={reset}>
            Reset this device
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
