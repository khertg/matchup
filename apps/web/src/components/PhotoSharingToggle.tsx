import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { setPhotoSharing } from '@/cloud/sync'
import { Label } from '@/components/ui/label'
import { getSharePhotos } from '@/db/settings'

/** The "Show player photos on the live page" switch, shared by the setup and session screens. */
export function PhotoSharingToggle() {
  const savedSharePhotos = useLiveQuery(getSharePhotos, [], false)
  // Ticks at once; the saved setting catches up a moment later.
  const [choice, setChoice] = useState<boolean | null>(null)
  const sharePhotos = choice ?? savedSharePhotos

  return (
    <div className="flex items-start gap-2">
      <input
        id="share-photos"
        type="checkbox"
        className="mt-1 size-4 accent-primary"
        checked={sharePhotos}
        onChange={(e) => {
          setChoice(e.target.checked)
          void setPhotoSharing(e.target.checked).finally(() => setChoice(null))
        }}
      />
      <div>
        <Label htmlFor="share-photos">Show player photos on the live page</Label>
        <p className="text-xs text-muted-foreground">
          For the whole club, off by default. When on, anyone with the live link can see player photos.
          Your club’s staff devices always get them. Emoji and initials avatars and the club logo are
          always shown.
        </p>
      </div>
    </div>
  )
}
