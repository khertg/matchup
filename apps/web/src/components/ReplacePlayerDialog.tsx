import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import type { PlayerPlace, PlayerStatus } from '@/lib/playerStatus'
import type { RosterPlayer } from '@/rotation/types'

/** Someone who could take the player's place, and where they are right now. */
export interface Candidate {
  player: RosterPlayer
  status: PlayerStatus
}

interface Props {
  /**
   * "court": swap someone out of a game in progress. "nextUp": change who is in the next group.
   * Either way anyone else in the session can be chosen (see replacePlayer and replaceNextUp).
   * "fill": choose who takes an open spot on a court (fillCourtSpot): someone waiting or on a break.
   */
  mode?: 'court' | 'nextUp' | 'fill'
  /** The player leaving the court, or leaving the next group. None when filling an open spot. */
  player?: RosterPlayer
  /** "fill": which spot, as "Court 1, Team A". */
  spot?: string
  /** Everyone in the session with where they are (the player themselves is left out here). */
  candidates: Candidate[]
  /** "court": the court the player is on. "nextUp": the lane of their group. Marks "this court" / "this group". */
  courtId?: number
  lane?: number
  onReplace: (substituteId: number, options: { sendOnBreak: boolean }) => void
}

const SECTIONS: { place: PlayerPlace; title: string }[] = [
  { place: 'nextUp', title: 'Next up' },
  { place: 'waiting', title: 'Waiting' },
  { place: 'court', title: 'On courts' },
  { place: 'break', title: 'On a break' },
]

const BADGE_VARIANT = { nextUp: 'default', waiting: 'secondary', court: 'outline', break: 'outline' } as const

/** Offer a search box once the list is longer than this. */
const SEARCH_FROM = 9

/** Opened from the player's menu (PlayerMenu), so it has no button of its own. */
export function ReplacePlayerDialog({ open, onOpenChange, ...props }: Props & ControlProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The header stays in view and only the list scrolls, however many players there are. */}
      <DialogContent className="flex max-h-[85dvh] flex-col">
        {/* Mounted only while open, so the break tick box and the search start empty every time. */}
        <SwapBody {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

interface ControlProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function SwapBody({ mode = 'court', player, spot, candidates, courtId, lane, onReplace, onDone }: Props & { onDone: () => void }) {
  const [sendOnBreak, setSendOnBreak] = useState(false)
  const [search, setSearch] = useState('')
  const nextUp = mode === 'nextUp'
  const fill = mode === 'fill'
  // An open spot is filled from the queue or a break; a swap can take anyone but the player themselves.
  const others = candidates.filter((c) => (fill ? c.status.place !== 'court' : c.player.id !== player?.id))
  const term = search.trim().toLowerCase()
  const shown = term ? others.filter((c) => c.player.name.toLowerCase().includes(term)) : others
  // The first in the queue is who comes on by default, so mark them on a court swap.
  const firstPlace = Math.min(...others.map((c) => c.status.queuePlace ?? Infinity))
  const firstInLine = others.find((c) => c.status.queuePlace === firstPlace)?.player.id

  function statusLabel({ status }: Candidate) {
    if (!nextUp && status.place === 'court' && status.courtId === courtId) return 'On this court'
    if (nextUp && status.place === 'nextUp' && status.lane === lane) return 'In this group'
    return status.label
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {fill ? `Fill the open spot · ${spot}` : nextUp ? `Replace ${player?.name} in Next up` : `Replace ${player?.name}`}
        </DialogTitle>
        <DialogDescription>
          {fill
            ? 'Choose who takes the open spot. The game carries on once the court is full.'
            : nextUp
              ? `Choose who takes their place. ${player?.name} stays in the queue where they are. Someone on a court trades places with ${player?.name}.`
              : sendOnBreak
                ? `Choose who takes their place. ${player?.name} will go on a break.`
                : `Choose who takes their place. ${player?.name} goes to the front of the queue. Someone on a court trades places with ${player?.name}.`}
        </DialogDescription>
      </DialogHeader>
      {others.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fill ? 'No one is waiting or on a break. Check someone in first.' : 'No one else is checked in.'}
        </p>
      ) : (
        <>
          {!nextUp && !fill && player && (
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
          {others.length >= SEARCH_FROM && (
            <Input
              type="search"
              aria-label="Find a player"
              placeholder="Find a player"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <div className="-mx-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-1">
            {shown.length === 0 && <p className="text-sm text-muted-foreground">No one matches “{search.trim()}”.</p>}
            {SECTIONS.map(({ place, title }) => {
              const rows = shown.filter((c) => c.status.place === place)
              if (rows.length === 0) return null
              return (
                <section key={place} aria-label={title} className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
                  <ul className="space-y-2">
                    {rows.map((c) => (
                      <li key={c.player.id}>
                        <Button
                          variant="outline"
                          className="h-auto min-h-12 w-full justify-between gap-2 py-2"
                          onClick={() => {
                            onReplace(c.player.id, { sendOnBreak: !nextUp && sendOnBreak })
                            onDone()
                          }}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <PlayerAvatar name={c.player.name} size="sm" />
                            <span className="min-w-0 truncate">{c.player.name}</span>
                            {!nextUp && c.player.id === firstInLine && (
                              <span className="text-xs text-muted-foreground">next in line</span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <Badge variant={BADGE_VARIANT[place]}>{statusLabel(c)}</Badge>
                            <Badge variant="secondary">Lv {c.player.skill}</Badge>
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
