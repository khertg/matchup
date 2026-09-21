import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { syncMedia } from '@/cloud/sync'
import { PhotoCropper } from '@/components/PhotoCropper'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { setLogoSetting } from '@/db/settings'
import { ImageError, loadPicture, processImage, type Picture } from '@/lib/avatar'
import type { Crop } from '@/lib/crop'
import { useClubLogo } from '@/lib/avatars'
import { cn } from '@/lib/utils'

/** The club logo where it is shown, or nothing at all when the club has none. */
export function ClubLogo({ className, name = 'Club' }: { className?: string; name?: string }) {
  const src = useClubLogo()
  if (!src) return null
  return (
    <img
      src={src}
      alt={`${name} logo`}
      data-testid="club-logo"
      className={cn('max-h-14 w-auto max-w-40 shrink-0 rounded-md object-contain', className)}
    />
  )
}

/** Add, change or remove the club logo. Kept on this device, and sent to the club when signed in. */
export function LogoEditorDialog() {
  const logo = useClubLogo()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const chooseRef = useRef<HTMLInputElement>(null)
  const takeRef = useRef<HTMLInputElement>(null)
  // The picture being cropped, once a file has been chosen and before the crop is confirmed.
  const [picture, setPicture] = useState<Picture | null>(null)

  // A temporary picture URL is released when it is no longer needed, including on closing.
  useEffect(() => () => picture?.release(), [picture])

  async function save(data: string | null) {
    await setLogoSetting(data)
    toast(data ? 'Club logo updated' : 'Club logo removed')
    void syncMedia()
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      // The crop is chosen next (or skipped); nothing is saved from the file yet.
      setPicture(await loadPicture(file))
    } catch (e) {
      setError(e instanceof ImageError ? e.message : 'That picture could not be used.')
    } finally {
      setBusy(false)
    }
  }

  /** Save the chosen part of the picture, or the whole of it when no crop is given. */
  async function applyCrop(crop?: Crop) {
    if (!picture) return
    setBusy(true)
    try {
      await save(await processImage(picture.file, 'logo', crop))
    } catch (e) {
      setError(e instanceof ImageError ? e.message : 'That picture could not be used.')
    } finally {
      setPicture(null)
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setPicture(null)
        if (next) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          {logo ? 'Change club logo' : 'Add club logo'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {picture ? (
          <>
            <DialogHeader>
              <DialogTitle>Crop club logo</DialogTitle>
              <DialogDescription>
                Drag the frame or its handles to choose the part to keep, or use the whole picture.
              </DialogDescription>
            </DialogHeader>
            <PhotoCropper
              picture={picture}
              mode="rect"
              busy={busy}
              onConfirm={(crop) => void applyCrop(crop)}
              onWhole={() => void applyCrop()}
              onCancel={() => setPicture(null)}
            />
          </>
        ) : (
          <>
        <DialogHeader>
          <DialogTitle>Club logo</DialogTitle>
          <DialogDescription>
            Shown on the setup screen, the session header, the stats card and the players' live page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-20 items-center justify-center rounded-lg border bg-muted/40 p-3">
          {logo ? (
            <img src={logo} alt="Current club logo" className="max-h-24 max-w-full object-contain" />
          ) : (
            <p className="text-sm text-muted-foreground">No logo yet.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => chooseRef.current?.click()}>
            Choose logo
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
          aria-label="Choose a logo file"
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
          capture="environment"
          className="sr-only"
          aria-label="Take a photo of the logo"
          tabIndex={-1}
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {logo && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void save(null)}>
            Remove logo
          </Button>
        )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
