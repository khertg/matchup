import { useState } from 'react'
import { toast } from 'sonner'
import { CourtCard } from '@/components/CourtCard'
import { QueueList } from '@/components/QueueList'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  isValidGameMinutes,
  MAX_AVG_GAME_MINUTES,
  MIN_AVG_GAME_MINUTES,
} from '@/rotation/engine'
import type { SessionState } from '@/rotation/types'
import { useSessionStore } from '@/store/session'

const TEAM_NAMES = ['Team A', 'Team B']

function GameLengthControl({ minutes }: { minutes: number }) {
  const setAvgGameMinutes = useSessionStore((s) => s.setAvgGameMinutes)
  const [text, setText] = useState(String(minutes))
  const valid = isValidGameMinutes(Number(text))

  function handleChange(value: string) {
    setText(value)
    if (isValidGameMinutes(Number(value))) setAvgGameMinutes(Number(value))
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="board-game-minutes" className="whitespace-nowrap">
        Game length (min)
      </Label>
      <Input
        id="board-game-minutes"
        type="number"
        inputMode="numeric"
        min={MIN_AVG_GAME_MINUTES}
        max={MAX_AVG_GAME_MINUTES}
        className="w-20"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        aria-invalid={!valid}
      />
    </div>
  )
}

export function BoardScreen({ session }: { session: SessionState }) {
  const recordResult = useSessionStore((s) => s.recordResult)
  const undo = useSessionStore((s) => s.undo)
  const cancelMatch = useSessionStore((s) => s.cancelMatch)
  const replacePlayer = useSessionStore((s) => s.replacePlayer)

  function handleResult(courtId: number, winner: 0 | 1) {
    recordResult(courtId, winner)
    toast(`Court ${courtId}: ${TEAM_NAMES[winner]} won`, {
      duration: 10_000,
      action: {
        label: 'Undo',
        onClick: () => {
          if (!undo()) toast.error("Can't undo: the session changed after that result")
        },
      },
    })
  }

  function handleReplace(courtId: number, outId: number, inId: number) {
    replacePlayer(courtId, outId, inId)
    toast(`${session.players[inId].name} replaced ${session.players[outId].name}`)
  }

  return (
    <div className="space-y-4">
      <GameLengthControl minutes={session.avgGameMinutes} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {session.courts.map((court) => (
          <CourtCard
            key={court.id}
            court={court}
            players={session.players}
            queue={session.queue}
            onReplace={(outId, inId) => handleReplace(court.id, outId, inId)}
            onResult={(winner) => handleResult(court.id, winner)}
            onCancel={() => cancelMatch(court.id)}
          />
        ))}
      </div>
      <QueueList session={session} />
    </div>
  )
}
