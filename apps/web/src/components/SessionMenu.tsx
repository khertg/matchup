import { MAX_LOCATION_LENGTH } from '@q2dink/shared'
import { LogOutIcon, MoreVerticalIcon, PencilIcon, QrCodeIcon, SlidersHorizontalIcon } from 'lucide-react'
import { useState } from 'react'
import { useClubAuth } from '@/cloud/auth'
import { EndSessionDialog } from '@/components/EndSessionDialog'
import { ManageCourtsDialog } from '@/components/ManageCourtsDialog'
import { RenameDialog } from '@/components/RenameDialog'
import { SharePanel } from '@/components/SharePanel'
import { Button } from '@/components/ui/button'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SessionState } from '@/rotation/types'
import { useSessionStore } from '@/store/session'

type ActiveDialog = 'rename' | 'courts' | 'share' | 'end' | null

/** Rename the session, manage courts, share the live view and end the session, tucked behind one button. */
export function SessionMenu({ session }: { session: SessionState }) {
  const club = useClubAuth((s) => s.club)
  const [active, setActive] = useState<ActiveDialog>(null)
  const location = useSessionStore((s) => s.location)

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="Session menu">
            <MoreVerticalIcon aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-56 flex-col gap-1 p-1">
          <PopoverClose asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setActive('rename')}
            >
              <PencilIcon aria-hidden="true" /> Rename session
            </Button>
          </PopoverClose>
          <PopoverClose asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setActive('courts')}
            >
              <SlidersHorizontalIcon aria-hidden="true" /> Manage courts
            </Button>
          </PopoverClose>
          {club && (
            <PopoverClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => setActive('share')}
              >
                <QrCodeIcon aria-hidden="true" /> Share live view
              </Button>
            </PopoverClose>
          )}
          <div className="border-t pt-1">
            <PopoverClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => setActive('end')}
              >
                <LogOutIcon aria-hidden="true" /> End session
              </Button>
            </PopoverClose>
          </div>
        </PopoverContent>
      </Popover>

      <RenameDialog
        open={active === 'rename'}
        onOpenChange={(open) => setActive(open ? 'rename' : null)}
        title="Rename session"
        description="Shown on the board, the live page and shared standings."
        label="Session name"
        current={location}
        maxLength={MAX_LOCATION_LENGTH}
        onSave={(name) => {
          try {
            useSessionStore.getState().renameSession(name)
            return null
          } catch (error) {
            return error instanceof RangeError ? error.message : 'Could not rename the session.'
          }
        }}
      />
      <ManageCourtsDialog
        session={session}
        open={active === 'courts'}
        onOpenChange={(open) => setActive(open ? 'courts' : null)}
      />
      {club && (
        <SharePanel
          photoToggle
          open={active === 'share'}
          onOpenChange={(open) => setActive(open ? 'share' : null)}
        />
      )}
      <EndSessionDialog
        session={session}
        open={active === 'end'}
        onOpenChange={(open) => setActive(open ? 'end' : null)}
      />
    </>
  )
}
