import { AvatarView } from '@/components/PlayerAvatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import type { ResolvedAvatar } from '@/lib/avatars'

interface Props {
  name: string
  avatar: ResolvedAvatar
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Staff only: go on to change the avatar. Without it (the live page) the view is look-only. */
  onChange?: () => void
}

/** A player's avatar, large: tap a small one anywhere to see the picture properly. */
export function AvatarViewDialog({ name, avatar, open, onOpenChange, onChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="items-center text-center sm:max-w-xs">
        <DialogTitle className="text-center">{name}</DialogTitle>
        <DialogDescription className="sr-only">A larger view of {name}&apos;s avatar.</DialogDescription>
        <div className="flex justify-center py-2">
          <AvatarView avatar={avatar} name={name} size="xl" />
        </div>
        {onChange && (
          <DialogFooter className="sm:flex-col-reverse">
            <Button className="w-full" onClick={onChange}>
              Change avatar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
