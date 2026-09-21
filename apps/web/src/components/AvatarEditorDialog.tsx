import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { syncMedia } from '@/cloud/sync'
import { AvatarView } from '@/components/PlayerAvatar'
import { PhotoCropper } from '@/components/PhotoCropper'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { setRosterAvatar } from '@/db/roster'
import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  ImageError,
  colorFor,
  initialsOf,
  loadPicture,
  processImage,
  type Picture,
  type PlayerAvatar,
} from '@/lib/avatar'
import type { Crop } from '@/lib/crop'
import { useOwnAvatar, type ResolvedAvatar } from '@/lib/avatars'
import { cloud } from '@/cloud/client'

interface Props {
  playerId: number
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** What the picture would look like for a draft, drawn the same way as everywhere else. */
function preview(draft: PlayerAvatar | null, name: string): ResolvedAvatar {
  if (draft?.kind === 'photo') return { kind: 'photo', src: draft.data }
  if (draft?.kind === 'emoji') return { kind: 'emoji', value: draft.value, color: draft.color }
  return { kind: 'initials', text: initialsOf(name), color: draft?.color ?? colorFor(name) }
}

/**
 * Change a player's avatar: a photo (chosen or taken), an emoji, or initials on a colour. The change
 * is saved on the roster, so it shows everywhere the player does, and sent to the club when signed in.
 */
export function AvatarEditorDialog({ playerId, name, open, onOpenChange }: Props) {
  const own = useOwnAvatar(playerId)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        {/* Keyed so every opening starts again from what is saved. */}
        {open && <Editor key={String(playerId)} playerId={playerId} name={name} initial={own} close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Editor({
  playerId,
  name,
  initial,
  close,
}: {
  playerId: number
  name: string
  initial: PlayerAvatar | null
  close: () => void
}) {
  const [draft, setDraft] = useState<PlayerAvatar | null>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const chooseRef = useRef<HTMLInputElement>(null)
  const takeRef = useRef<HTMLInputElement>(null)
  // The picture being cropped, once a file has been chosen and before the crop is confirmed.
  const [picture, setPicture] = useState<Picture | null>(null)

  // A temporary picture URL is released when it is no longer needed, including on closing.
  useEffect(() => () => picture?.release(), [picture])

  const color = draft && draft.kind !== 'photo' ? draft.color : colorFor(name)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      // The user chooses the crop next; nothing is saved from the file yet.
      setPicture(await loadPicture(file))
    } catch (e) {
      setError(e instanceof ImageError ? e.message : 'That picture could not be used.')
    } finally {
      setBusy(false)
    }
  }

  async function applyCrop(crop: Crop) {
    if (!picture) return
    setBusy(true)
    try {
      setDraft({ kind: 'photo', data: await processImage(picture.file, 'avatar', crop) })
      setPicture(null)
    } catch (e) {
      setError(e instanceof ImageError ? e.message : 'That picture could not be used.')
      setPicture(null)
    } finally {
      setBusy(false)
    }
  }

  async function save(next: PlayerAvatar | null) {
    setBusy(true)
    try {
      await setRosterAvatar(playerId, next)
      toast(next ? `${name}'s avatar updated` : `${name}'s avatar removed`)
      close()
      void syncMedia()
    } catch {
      setError('Could not save the avatar. Try again.')
      setBusy(false)
    }
  }

  if (picture) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Crop photo for {name}</DialogTitle>
          <DialogDescription>
            Move and zoom the picture so the part you want is inside the circle.
          </DialogDescription>
        </DialogHeader>
        <PhotoCropper
          picture={picture}
          mode="circle"
          busy={busy}
          onConfirm={(crop) => void applyCrop(crop)}
          onCancel={() => setPicture(null)}
        />
      </>
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Avatar for {name}</DialogTitle>
        <DialogDescription>
          Choose a photo, an emoji or a colour. It shows wherever {name} appears.
        </DialogDescription>
      </DialogHeader>

      <div className="flex justify-center" aria-live="polite">
        <AvatarView avatar={preview(draft, name)} name={name} size="lg" />
      </div>

      <section aria-label="Photo" className="space-y-2">
        <p className="text-sm font-medium">Photo</p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => chooseRef.current?.click()}>
            Choose photo
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => takeRef.current?.click()}>
            Take photo
          </Button>
        </div>
        <input
          ref={chooseRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Choose a photo file"
          tabIndex={-1}
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <input
          ref={takeRef}
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          aria-label="Take a photo with the camera"
          tabIndex={-1}
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {cloud && (
          <p className="text-xs text-muted-foreground">
            Photos stay on staff devices unless photo sharing is switched on in the club panel.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      <section aria-label="Emoji" className="space-y-2">
        <p className="text-sm font-medium">Emoji</p>
        <div className="grid grid-cols-8 gap-1">
          {AVATAR_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Emoji ${emoji}`}
              aria-pressed={draft?.kind === 'emoji' && draft.value === emoji}
              className="flex size-9 items-center justify-center rounded-md text-lg hover:bg-accent aria-pressed:bg-primary/15 aria-pressed:ring-2 aria-pressed:ring-primary"
              onClick={() => setDraft({ kind: 'emoji', value: emoji, color })}
            >
              {emoji}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Colour" className="space-y-2">
        <p className="text-sm font-medium">Colour</p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Colour ${swatch}`}
              aria-pressed={draft !== null && draft.kind !== 'photo' && draft.color === swatch}
              className="size-7 rounded-full ring-offset-2 ring-offset-popover aria-pressed:ring-2 aria-pressed:ring-foreground"
              style={{ backgroundColor: swatch }}
              // A colour on its own is the initials avatar; on an emoji it recolours the emoji's badge.
              onClick={() =>
                setDraft(draft?.kind === 'emoji' ? { ...draft, color: swatch } : { kind: 'initials', color: swatch })
              }
            />
          ))}
        </div>
      </section>

      <DialogFooter className="sm:flex-col-reverse">
        <Button className="w-full" disabled={busy} onClick={() => save(draft)}>
          Save avatar
        </Button>
        <Button variant="outline" className="w-full" disabled={busy || (initial === null && draft === null)} onClick={() => save(null)}>
          Remove avatar
        </Button>
      </DialogFooter>
    </>
  )
}
