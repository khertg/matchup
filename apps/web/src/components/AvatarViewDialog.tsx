import { useEffect, useState, type FormEvent } from 'react'
import { AvatarView } from '@/components/PlayerAvatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ResolvedAvatar } from '@/lib/avatars'
import { MAX_PLAYER_NAME_LENGTH } from '@q2dink/shared'

interface Props {
  name: string
  avatar: ResolvedAvatar
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Staff only: go on to change the avatar. Without it (the live page) the view is look-only. */
  onChange?: () => void
  /**
   * Staff only: change the player's name. Resolves to nothing when it was saved, or to a message
   * saying why the name was refused. Without it the name cannot be edited.
   */
  onRename?: (name: string) => Promise<string | null>
}

/** A player's avatar, large: tap a small one anywhere to see the picture properly. Staff can also rename them. */
export function AvatarViewDialog({ name, avatar, open, onOpenChange, onChange, onRename }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Every time the view opens it starts on the picture, not on a half-typed name.
  useEffect(() => {
    if (open) {
      setEditing(false)
      setDraft(name)
      setError(null)
    }
    // Only when it opens: a rename that just went through changes `name` while it stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function startEditing() {
    setDraft(name)
    setError(null)
    setEditing(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!onRename) return
    setBusy(true)
    setError(null)
    try {
      const problem = await onRename(draft)
      if (problem) {
        setError(problem)
      } else {
        // Saved: back to what they were doing. The toast says what changed.
        setEditing(false)
        onOpenChange(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="items-center text-center sm:max-w-xs">
        {editing ? (
          <form onSubmit={save} className="w-full space-y-3 text-left">
            <DialogTitle>Edit name</DialogTitle>
            <DialogDescription className="sr-only">Change the name of {name}.</DialogDescription>
            <div className="space-y-2">
              <Label htmlFor="rename-player">Player name</Label>
              <Input
                id="rename-player"
                value={draft}
                maxLength={MAX_PLAYER_NAME_LENGTH}
                autoComplete="off"
                autoFocus
                aria-invalid={error ? true : undefined}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Escape cancels the edit first; a second Escape closes the dialog as usual.
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    e.stopPropagation()
                    setEditing(false)
                  }
                }}
              />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={busy || draft.trim() === ''}>
                Save name
              </Button>
            </div>
          </form>
        ) : (
          <>
            <DialogTitle className="text-center">{name}</DialogTitle>
            <DialogDescription className="sr-only">A larger view of {name}&apos;s avatar.</DialogDescription>
            <div className="flex justify-center py-2">
              <AvatarView avatar={avatar} name={name} size="xl" />
            </div>
            {(onChange || onRename) && (
              <DialogFooter className="w-full sm:flex-col-reverse">
                {onChange && (
                  <Button className="w-full" onClick={onChange}>
                    Change avatar
                  </Button>
                )}
                {onRename && (
                  <Button variant="outline" className="w-full" onClick={startEditing}>
                    Edit name
                  </Button>
                )}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
