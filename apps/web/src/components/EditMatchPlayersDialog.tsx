import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { RosterPlayer, Teams } from '@/rotation/types'

interface Props {
  courtName: string
  teams: Teams
  /** Every player who has ever been part of this session, not just those currently waiting. */
  players: Record<number, RosterPlayer>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (teams: Teams) => void
}

const TEAM_LABELS = ['Team A', 'Team B'] as const

/** Reassign who was actually on each team for an already-recorded match. */
export function EditMatchPlayersDialog({ courtName, teams, players, open, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed by the teams so the pickers reset to the current lineup each time it opens. */}
        {open && (
          <EditPlayersForm
            key={teams.flat().join(',')}
            courtName={courtName}
            teams={teams}
            players={players}
            onOpenChange={onOpenChange}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditPlayersForm({ courtName, teams, players, onOpenChange, onSubmit }: Omit<Props, 'open'>) {
  const [slots, setSlots] = useState<Teams>(teams)
  const roster = Object.values(players)
  const chosen = new Set(slots.flat())

  function setSlot(teamIndex: 0 | 1, slotIndex: number, playerId: number) {
    setSlots((prev) => {
      const next: Teams = [[...prev[0]], [...prev[1]]]
      next[teamIndex][slotIndex] = playerId
      return next
    })
  }

  function handleSubmit() {
    onSubmit(slots)
    onOpenChange(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit players</DialogTitle>
        <DialogDescription>{courtName}: choose who actually played on each team.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        {slots.map((team, teamIndex) => (
          <div key={teamIndex} className="space-y-2">
            <Label>{TEAM_LABELS[teamIndex]}</Label>
            {team.map((playerId, slotIndex) => (
              <Select
                key={slotIndex}
                value={String(playerId)}
                onValueChange={(v) => setSlot(teamIndex as 0 | 1, slotIndex, Number(v))}
              >
                <SelectTrigger
                  className="w-full"
                  aria-label={`${TEAM_LABELS[teamIndex]} player ${slotIndex + 1}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roster
                    .filter((p) => p.id === playerId || !chosen.has(p.id))
                    .map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ))}
          </div>
        ))}
      </div>
      <Button type="button" className="h-11 w-full" onClick={handleSubmit}>
        Save players
      </Button>
    </>
  )
}
