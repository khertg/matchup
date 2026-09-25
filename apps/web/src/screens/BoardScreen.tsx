import { toast } from 'sonner'
import { CourtCard } from '@/components/CourtCard'
import { CourtGrid } from '@/components/CourtGrid'
import { MatchLog } from '@/components/MatchLog'
import { NextUpCard, type NextUpLane } from '@/components/NextUpCard'
import { QueueList } from '@/components/QueueList'
import { waitingMessage } from '@/lib/nextUp'
import { levelLabel } from '@/lib/skill'
import { useSkillEditor } from '@/lib/useSkillEditor'
import { isNextUpPicked, nextGroup, nextGroups, type NextGroup } from '@/rotation/engine'
import { hasLevelCourts, inLevels, sameLevels } from '@/rotation/levels'
import type { Court, SessionState, Teams } from '@/rotation/types'
import { useSessionStore } from '@/store/session'

const TEAM_NAMES = ['Team A', 'Team B']

export function BoardScreen({ session }: { session: SessionState }) {
  const recordScore = useSessionStore((s) => s.recordScore)
  const undo = useSessionStore((s) => s.undo)
  const cancelMatch = useSessionStore((s) => s.cancelMatch)
  const replacePlayer = useSessionStore((s) => s.replacePlayer)
  const replaceNextUp = useSessionStore((s) => s.replaceNextUp)
  const resetNextUp = useSessionStore((s) => s.resetNextUp)
  const startGame = useSessionStore((s) => s.startGame)
  const checkOutPlayer = useSessionStore((s) => s.checkOutPlayer)
  const editMatch = useSessionStore((s) => s.editMatch)
  const changeSkill = useSkillEditor()

  // Games never start by themselves. These are the groups staff would start next (one per level range
  // while courts are kept for levels), and what each open court offers: start its group, start with
  // whoever is waiting (mixed doubles, or too few players in the court's range), or wait.
  const lanes = nextGroups(session)
  const byLevel = hasLevelCourts(session)
  const group = lanes[0].group
  const anyone = nextGroup(session, { ignoreMode: true })
  const groupFor = (court: Court): NextGroup | null =>
    lanes.find((lane) => sameLevels(lane.levels, court.levels))?.group ?? null
  const startStateFor = (court: Court) => (groupFor(court) ? 'ready' : anyone ? 'override' : 'none')
  const teamNames = (g: NextGroup) =>
    g.teams.map((team) => team.map((id) => session.players[id]?.name ?? 'Player').join(' & ')).join(' vs ')
  /** On a level court, the group that would start there, so staff can call its players. */
  const nextHereFor = (court: Court) => {
    const courtGroup = court.levels ? groupFor(court) : null
    return courtGroup ? teamNames(courtGroup) : undefined
  }
  const nextUpIds = lanes.flatMap((lane) => lane.group?.players ?? [])
  const levelLanes: NextUpLane[] | undefined = byLevel
    ? lanes.map((lane) => ({
        label: levelLabel(lane.levels) ?? 'Any level',
        nextUp: lane.group?.players ?? [],
        emptyMessage: waitingMessage(session, lane.levels),
        waiting: session.queue
          .filter((id) => !lane.group?.players.includes(id) && inLevels(session.players[id]?.skill ?? 0, lane.levels))
          .map((id) => session.players[id]),
      }))
    : undefined

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

  function handleEditScore(matchIndex: number, score: [number, number]) {
    editMatch(matchIndex, { score })
    toast(`Match ${matchIndex + 1}: score corrected`)
  }

  function handleEditPlayers(matchIndex: number, teams: Teams) {
    editMatch(matchIndex, { teams })
    toast(`Match ${matchIndex + 1}: players corrected`)
  }

  return (
    <div className="space-y-4">
      <CourtGrid>
        {session.courts.map((court) => (
          <CourtCard
            key={court.id}
            court={court}
            players={session.players}
            queue={session.queue}
            partners={session.partners}
            startState={startStateFor(court)}
            waitingMessage={waitingMessage(session, court.levels)}
            nextHere={nextHereFor(court)}
            onStart={(options) => handleStart(court.id, options)}
            onReplace={(outId, inId, options) => handleReplace(court.id, outId, inId, options.sendOnBreak)}
            onSkillChange={changeSkill}
            onScore={(a, b) => handleScore(court.id, a, b)}
            onCancel={() => handleCancel(court.id)}
          />
        ))}
      </CourtGrid>
      <NextUpCard
        nextUp={group?.players ?? []}
        players={session.players}
        emptyMessage={waitingMessage(session)}
        waiting={session.queue.filter((id) => !group?.players.includes(id)).map((id) => session.players[id])}
        onReplace={handleReplaceNextUp}
        picked={isNextUpPicked(session)}
        onReset={resetNextUp}
        onSkillChange={changeSkill}
        editable
        queuedAt={session.queuedAt}
        lanes={levelLanes}
      />
      <QueueList
        session={session}
        nextUp={nextUpIds}
        onSkillChange={changeSkill}
        onTakeBreak={checkOutPlayer}
        editable
      />
      <MatchLog
        matches={session.matches ?? []}
        players={session.players}
        onEditScore={handleEditScore}
        onEditPlayers={handleEditPlayers}
      />
    </div>
  )
}
