import { ArrowRightLeft } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import type { RosterPlayer } from '@/rotation/types'

interface Props {
  /**
   * "court": swap someone out of a game in progress; they go to the front of the queue, or on a
   * break when asked. "nextUp": change who is in the next group; the player taken out keeps their
   * place in the queue.
   */
  mode?: 'court' | 'nextUp'
  /** The player leaving the court, or leaving the next group. */
  player: RosterPlayer
  /** Players who could take their place, in queue order; the first is marked "next in line" on a court. */
  waiting: RosterPlayer[]
  onReplace: (substituteId: number, options: { sendOnBreak: boolean }) => void
}

export function ReplacePlayerDialog({ mode = 'court', player, waiting, onReplace }: Props) {
  const [open, setOpen] = useState(false)
  const [sendOnBreak, setSendOnBreak] = useState(false)
  const nextUp = mode === 'nextUp'

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) setSendOnBreak(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={nextUp ? `Change ${player.name} in Next up` : `Replace ${player.name}`}
        >
          <ArrowRightLeft />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{nextUp ? `Replace ${player.name} in Next up` : `Replace ${player.name}`}</DialogTitle>
          <DialogDescription>
            {nextUp
              ? `Choose who takes their place. ${player.name} stays in the queue where they are.`
              : sendOnBreak
                ? `Choose who takes their place. ${player.name} will go on a break.`
                : `Choose who takes their place. ${player.name} goes to the front of the queue.`}
          </DialogDescription>
        </DialogHeader>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {nextUp
              ? 'No one else is waiting to take their place.'
              : 'No one is waiting to substitute. Check someone in first.'}
          </p>
        ) : (
          <>
            {!nextUp && (
              <div className="flex items-center gap-2">
                <input
                  id="send-on-break"
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={sendOnBreak}
                  onChange={(e) => setSendOnBreak(e.target.checked)}
                />
                <Label htmlFor="send-on-break">Send {player.name} on a break instead</Label>
              </div>
            )}
            <ul className="space-y-2">
              {waiting.map((p, index) => (
                <li key={p.id}>
                  <Button
                    variant="outline"
                    className="h-auto min-h-12 w-full justify-between py-2"
                    onClick={() => {
                      onReplace(p.id, { sendOnBreak: !nextUp && sendOnBreak })
                      setOpen(false)
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <PlayerAvatar id={p.id} name={p.name} size="sm" />
                      {p.name}
                      {!nextUp && index === 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">next in line</span>
                      )}
                    </span>
                    <Badge variant="secondary">Lv {p.skill}</Badge>
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
