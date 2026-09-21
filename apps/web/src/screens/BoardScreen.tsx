import { useState } from 'react'
import { toast } from 'sonner'
import { CourtCard } from '@/components/CourtCard'
import { AddCourtButton, ManageCourtsDialog } from '@/components/ManageCourtsDialog'
import { NextUpCard } from '@/components/NextUpCard'
import { QueueList } from '@/components/QueueList'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { waitingMessage } from '@/lib/nextUp'
import {
  isValidGameMinutes,
  MAX_AVG_GAME_MINUTES,
  MIN_AVG_GAME_MINUTES,
  isNextUpPicked,
  nextGroup,
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
  const recordScore = useSessionStore((s) => s.recordScore)
  const undo = useSessionStore((s) => s.undo)
  const cancelMatch = useSessionStore((s) => s.cancelMatch)
  const replacePlayer = useSessionStore((s) => s.replacePlayer)
  const replaceNextUp = useSessionStore((s) => s.replaceNextUp)
  const resetNextUp = useSessionStore((s) => s.resetNextUp)
  const startGame = useSessionStore((s) => s.startGame)

  // Games never start by themselves. This is the group staff would start next, and what each
  // open court offers: start it, start with whoever is waiting (mixed doubles), or wait.
  const group = nextGroup(session)
  const startState = group
    ? 'ready'
    : nextGroup(session, { ignoreMode: true })
      ? 'override'
      : 'none'

  const courtName = (courtId: number) =>
    session.courts.find((c) => c.id === courtId)?.name ?? `Court ${courtId}`

  /** The toast that follows a result or a score, with the 10-second undo. */
  function announce(message: string) {
    toast(message, {
      duration: 10_000,
      action: {
        label: 'Undo',
        onClick: () => {
          if (!undo()) toast.error("Can't undo: the session changed after that result")
        },
      },
    })
  }

  function handleScore(courtId: number, scoreA: number, scoreB: number) {
    recordScore(courtId, scoreA, scoreB)
    const winner = scoreA > scoreB ? 0 : 1
    announce(`${courtName(courtId)}: ${TEAM_NAMES[winner]} won ${Math.max(scoreA, scoreB)}–${Math.min(scoreA, scoreB)}`)
  }

  function handleCancel(courtId: number) {
    cancelMatch(courtId)
    toast(`${courtName(courtId)}: game cancelled`)
  }

  function handleStart(courtId: number, options?: { ignoreMode?: boolean }) {
    startGame(courtId, options)
    toast(`${courtName(courtId)} started`)
  }

  /** Whether the player is in a partner lock, in force or waiting. */
  const hasLock = (id: number) =>
    [...session.partners, ...(session.pendingPartners ?? []).map(({ pair }) => pair)].some((pair) => pair.includes(id))

  function handleReplace(courtId: number, outId: number, inId: number, sendOnBreak: boolean) {
    const wasLocked = hasLock(outId)
    replacePlayer(courtId, outId, inId, { sendOnBreak })
    const out = session.players[outId].name
    toast(
      `${session.players[inId].name} replaced ${out}. ${out} ${sendOnBreak ? 'is on a break' : 'is first in the queue'}.` +
        (wasLocked ? ' Their partner lock was removed.' : ''),
    )
  }

  function handleReplaceNextUp(outId: number, inId: number) {
    const wasLocked = hasLock(outId) || hasLock(inId)
    replaceNextUp(outId, inId)
    toast(
      `${session.players[inId].name} is next up instead of ${session.players[outId].name}.` +
        (wasLocked ? ' Partner locks were removed.' : ''),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <GameLengthControl minutes={session.avgGameMinutes} />
        <div className="flex flex-wrap items-start gap-2">
          <AddCourtButton session={session} />
          <ManageCourtsDialog session={session} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {session.courts.map((court) => (
          <CourtCard
            key={court.id}
            court={court}
            players={session.players}
            queue={session.queue}
            partners={session.partners}
            startState={startState}
            waitingMessage={waitingMessage(session)}
            onStart={(options) => handleStart(court.id, options)}
            onReplace={(outId, inId, options) => handleReplace(court.id, outId, inId, options.sendOnBreak)}
            onScore={(a, b) => handleScore(court.id, a, b)}
            onCancel={() => handleCancel(court.id)}
          />
        ))}
      </div>
      <NextUpCard
        nextUp={group?.players ?? []}
        players={session.players}
        emptyMessage={waitingMessage(session)}
        waiting={session.queue.filter((id) => !group?.players.includes(id)).map((id) => session.players[id])}
        onReplace={handleReplaceNextUp}
        picked={isNextUpPicked(session)}
        onReset={resetNextUp}
      />
      <QueueList session={session} nextUp={group?.players} />
    </div>
  )
}
