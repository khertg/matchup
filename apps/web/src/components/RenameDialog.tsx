import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** The field's label, e.g. "Session name". */
  label: string
  current: string
  maxLength: number
  /** Save the new name (already trimmed). Returns a problem to show, or null once saved. */
  onSave: (name: string) => Promise<string | null> | string | null
}

/** One name to change: the session's or the club's. */
export function RenameDialog({ open, onOpenChange, ...form }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {/* The content unmounts while closed, so each opening starts from the name as it is now. */}
        <RenameForm {...form} close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function RenameForm({
  title,
  description,
  label,
  current,
  maxLength,
  onSave,
  close,
}: Omit<Props, 'open' | 'onOpenChange'> & { close: () => void }) {
  const id = useId()
  const [draft, setDraft] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const trimmed = draft.trim()

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!trimmed || trimmed === current) return
    setBusy(true)
    setError(null)
    try {
      const problem = await onSave(trimmed)
      if (problem) setError(problem)
      else close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          value={draft}
          maxLength={maxLength}
          autoComplete="off"
          autoFocus
          onFocus={(e) => e.target.select()}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setDraft(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={busy || !trimmed || trimmed === current}>
              Save
            </Button>
          </div>
        </form>
  )
}
