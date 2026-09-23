import { LogOutIcon, MoreVerticalIcon, QrCodeIcon, SlidersHorizontalIcon } from 'lucide-react'
import { useState } from 'react'
import { useClubAuth } from '@/cloud/auth'
import { EndSessionDialog } from '@/components/EndSessionDialog'
import { ManageCourtsDialog } from '@/components/ManageCourtsDialog'
import { SharePanel } from '@/components/SharePanel'
import { Button } from '@/components/ui/button'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SessionState } from '@/rotation/types'

type ActiveDialog = 'courts' | 'share' | 'end' | null

/** Manage courts, share the live view and end the session, tucked behind one button. */
export function SessionMenu({ session }: { session: SessionState }) {
  const club = useClubAuth((s) => s.club)
  const [active, setActive] = useState<ActiveDialog>(null)

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
