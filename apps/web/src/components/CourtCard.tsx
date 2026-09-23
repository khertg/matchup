import { Lock, MoreVerticalIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CancelGameDialog } from '@/components/CancelGameDialog'
import { ReplacePlayerDialog } from '@/components/ReplacePlayerDialog'
import { ScoreDialog } from '@/components/ScoreDialog'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { SkillBadge } from '@/components/SkillBadge'
import type { SkillLevel } from '@/db/db'
import { formatDuration, useNow } from '@/lib/time'
import type { Court, RosterPlayer } from '@/rotation/types'

interface Props {
  court: Court
  players: Record<number, RosterPlayer>
  /** Locked partner pairs, to mark teams that are locked together. */
  partners: [number, number][]
  /** Read-only cards (the public viewer page) show teams but no controls. */
  readOnly?: boolean
  /** Waiting player ids in queue order, offered as substitutes. */
  queue?: number[]
  onReplace?: (outId: number, inId: number, options: { sendOnBreak: boolean }) => void
  /** Staff only: change a player's skill level from their badge. */
  onSkillChange?: (playerId: number, skill: SkillLevel) => void
  /**
   * What an open court can do. "ready": a next group exists, so Start game is offered.
   * "override": no group fits the matchmaking mode (mixed doubles), but staff may start
   * with whoever is waiting. "none": not enough players yet.
   */
  startState?: 'ready' | 'override' | 'none'
  /** Why no game can start yet, shown on an open court when startState is "none". */
  waitingMessage?: string
  onStart?: (options?: { ignoreMode?: boolean }) => void
  /** Record the game from its score (Team A, then Team B). Asked for after a win button is pressed. */
  onScore?: (scoreA: number, scoreB: number) => void
  onCancel?: () => void
}

const TEAM_NAMES = ['Team A', 'Team B'] as const

/** How long the game has been going, refreshed every 30 seconds by its own timer. */
function Elapsed({ startedAt }: { startedAt: number }) {
  const now = useNow()
  return <p className="text-xs text-muted-foreground">Playing {formatDuration((now - startedAt) / 1000)}</p>
}

export function CourtCard({
  court,
  players,
  partners,
  readOnly = false,
  queue = [],
  onReplace,
  onSkillChange,
  startState = 'none',
  waitingMessage = 'Waiting for players to check in',
  onStart,
  onScore,
  onCancel,
}: Props) {
  // The team whose win button was pressed; the score pop-up is open while this is set.
  const [pendingWinner, setPendingWinner] = useState<0 | 1 | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  return (
    <Card role="region" aria-label={court.name}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">{court.name}</span>
          <div className="flex shrink-0 items-center gap-2">
            {court.teams && court.startedAt !== undefined && <Elapsed startedAt={court.startedAt} />}
            {court.teams ? <Badge>In play</Badge> : <Badge variant="outline">Open</Badge>}
            {court.teams && !readOnly && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Court menu">
                    <MoreVerticalIcon aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-40 p-1">
                  <PopoverClose asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => setConfirmingCancel(true)}
                    >
                      Cancel game
                    </Button>
                  </PopoverClose>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {court.teams ? (
          <>
            {court.teams.map((team, i) => (
              <div
                key={TEAM_NAMES[i]}
                role="group"
                aria-label={TEAM_NAMES[i]}
                className="rounded-lg border p-2"
              >
                <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  {TEAM_NAMES[i]}
                  {partners.some(([x, y]) => team.includes(x) && team.includes(y)) && (
                    <Lock className="size-3" aria-label="Locked partners" />
                  )}
                </p>
                <ul>
                  {team.map((id) => (
                    <li key={id} className="flex items-center gap-2 py-1">
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        {players[id] && <PlayerAvatar id={id} name={players[id].name} size="sm" editable={!readOnly} viewable />}
                        <span className="min-w-0 truncate">{players[id]?.name}</span>
                        {court.waited?.[id] !== undefined && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            Waited {formatDuration(court.waited[id])}
                          </span>
                        )}
                      </span>
                      {players[id] && (
                        <SkillBadge
                          player={players[id]}
                          onChange={!readOnly && onSkillChange ? (skill) => onSkillChange(id, skill) : undefined}
                        />
                      )}
                      {!readOnly && onReplace && (
                        <ReplacePlayerDialog
                          player={players[id]}
                          waiting={queue.map((qid) => players[qid])}
                          onReplace={(inId, options) => onReplace(id, inId, options)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!readOnly && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-11" onClick={() => setPendingWinner(0)}>
                    Team A won
                  </Button>
                  <Button className="h-11" onClick={() => setPendingWinner(1)}>
                    Team B won
                  </Button>
                </div>
                <ScoreDialog
                  courtName={court.name}
                  teamNames={[
                    court.teams[0].map((id) => players[id]?.name ?? ''),
                    court.teams[1].map((id) => players[id]?.name ?? ''),
                  ]}
                  winner={pendingWinner}
                  onClose={() => setPendingWinner(null)}
                  onSubmit={(a, b) => onScore?.(a, b)}
                />
                <CancelGameDialog
                  courtName={court.name}
                  players={court.teams.flat().length}
                  open={confirmingCancel}
                  onOpenChange={setConfirmingCancel}
                  onConfirm={() => onCancel?.()}
                />
              </>
            )}
          </>
        ) : (
          <div className="space-y-3 py-4 text-center">
            {readOnly ? (
              <p className="text-sm text-muted-foreground">Waiting for the next game</p>
            ) : startState === 'ready' ? (
              <>
                <p className="text-sm text-muted-foreground">Ready for the next game</p>
                <Button className="h-11 w-full" onClick={() => onStart?.()}>
                  Start game
                </Button>
              </>
            ) : startState === 'override' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  No group fits this matchmaking mode yet. Check in more players, or start with whoever is
                  waiting.
                </p>
                <Button variant="outline" className="h-11 w-full" onClick={() => onStart?.({ ignoreMode: true })}>
                  Start with waiting players
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{waitingMessage}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
