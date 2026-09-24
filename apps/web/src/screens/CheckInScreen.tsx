import { useLiveQuery } from 'dexie-react-hooks'
import { Lock } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RosterCheckIn } from '@/components/RosterCheckIn'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MAX_PLAYER_NAME_LENGTH } from '@q2dink/shared'
import type { Gender, SkillLevel } from '@/db/db'
import { addOrGetPlayer, listRoster } from '@/db/roster'
import { useClubAuth } from '@/cloud/auth'
import { requestRosterSync } from '@/cloud/sync'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { SkillBadge } from '@/components/SkillBadge'
import { DEFAULT_SKILL, SKILL_LEVELS, skillOptionLabel } from '@/lib/skill'
import { useSkillEditor } from '@/lib/useSkillEditor'
import { lockStatus, playingIds, type AwayPartner } from '@/rotation/engine'
import type { SessionState } from '@/rotation/types'
import { useSessionStore } from '@/store/session'

/** Select values can't be empty, so "not set" is a sentinel. */
type GenderChoice = Gender | 'U'

const GENDER_OPTIONS: { value: GenderChoice; label: string }[] = [
  { value: 'U', label: 'Not set' },
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
]

function PartnersCard({ session }: { session: SessionState }) {
  const lockPartners = useSessionStore((s) => s.lockPartners)
  const unlockPartners = useSessionStore((s) => s.unlockPartners)
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const canLock = first !== '' && second !== '' && first !== second

  const [confirming, setConfirming] = useState(false)

  const pending = session.pendingPartners ?? []
  const locked = new Set([...session.partners.flat(), ...pending.flatMap(({ pair }) => pair)])
  const available = Object.values(session.players).filter((p) => !locked.has(p.id))

  const a = Number(first)
  const b = Number(second)
  // A lock made while a partner is on a court or a break waits until both have finished a game.
  const status = canLock ? lockStatus(session, a, b) : null
  const name = (id: number) => session.players[id].name

  function whereIs({ id, courtName }: AwayPartner) {
    return courtName ? `${name(id)} is playing on ${courtName}` : `${name(id)} is on a break`
  }

  function doLock() {
    lockPartners(a, b)
    toast(
      status?.inForce === false
        ? `${name(a)} and ${name(b)} will be partners once both have finished a game`
        : `${name(a)} and ${name(b)} are now partners`,
    )
    setFirst('')
    setSecond('')
    setConfirming(false)
  }

  function handleLock() {
    if (status?.inForce === false) setConfirming(true)
    else doLock()
  }

  const pick = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Choose a player" />
        </SelectTrigger>
        <SelectContent>
          {available.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Partners</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Locked partners always share a team and wait in the queue together.
        </p>

        {(session.partners.length > 0 || pending.length > 0) && (
          <ul className="divide-y">
            {[...session.partners.map((pair) => ({ pair, waiting: false })), ...pending.map(({ pair }) => ({ pair, waiting: true }))].map(({ pair: [a, b], waiting }) => (
              <li key={`${a}-${b}`} className="flex items-center gap-3 py-2">
                <Lock className={`size-4 ${waiting ? 'text-muted-foreground/50' : 'text-muted-foreground'}`} aria-hidden />
                <span className="flex-1">
                  {session.players[a].name} &amp; {session.players[b].name}
                  {waiting && (
                    <span className="block text-xs text-muted-foreground">
                      Starts after both have played. Each keeps their own turn until then.
                    </span>
                  )}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Unlock ${session.players[a].name} and ${session.players[b].name}`}
                  onClick={() => unlockPartners(a)}
                >
                  Unlock
                </Button>
              </li>
            ))}
          </ul>
        )}

        {available.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            Check in at least two unpaired players to lock partners.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {pick('partner-first', 'First partner', first, setFirst)}
              {pick('partner-second', 'Second partner', second, setSecond)}
            </div>
            <Button className="h-11 w-full" disabled={!canLock} onClick={handleLock}>
              Lock partners
            </Button>
            {status?.inForce === false && (
              <Dialog open={confirming} onOpenChange={setConfirming}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      Lock {name(a)} and {name(b)}?
                    </DialogTitle>
                    <DialogDescription>
                      {status.away.map(whereIs).join(' and ')}.{' '}
                      {status.away.length === 1
                        ? `${name(status.away[0].id === a ? b : a)} keeps their place in line.`
                        : 'Each keeps their own place in line.'}{' '}
                      The lock starts once both of them have finished a game.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                    <Button onClick={doLock}>Lock anyway</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function CheckInScreen({ session }: { session: SessionState }) {
  const checkInPlayer = useSessionStore((s) => s.checkInPlayer)
  const checkOutPlayer = useSessionStore((s) => s.checkOutPlayer)
  const changeSkill = useSkillEditor()
  const clubSlug = useClubAuth((s) => s.club?.slug)
  const roster = useLiveQuery(() => listRoster(clubSlug), [clubSlug])
  // Bring in players the club's other devices saved, as soon as check-in opens.
  useEffect(() => requestRosterSync(), [clubSlug])

  const [name, setName] = useState('')
  const [skill, setSkill] = useState<SkillLevel>(DEFAULT_SKILL)
  const [gender, setGender] = useState<GenderChoice>('U')

  const genderRequired = session.mode === 'doubles' && session.matchmaking === 'mixed'
  const canSubmit = name.trim() !== '' && (!genderRequired || gender !== 'U')

  function handleNameChange(value: string) {
    setName(value)
    // Returning players (picked from auto-complete) keep their saved details.
    const known = roster?.find((p) => p.name.toLowerCase() === value.trim().toLowerCase())
    if (known) {
      setSkill(known.skill)
      if (known.gender) setGender(known.gender)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const player = await addOrGetPlayer(name, skill, gender === 'U' ? undefined : gender, clubSlug)
    requestRosterSync()
    const added = checkInPlayer(player)
    toast(added ? `${player.name} checked in` : `${player.name} is already checked in`)
    if (added) {
      setName('')
      setSkill(DEFAULT_SKILL)
      setGender('U')
    }
  }

  const playing = playingIds(session).length

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Check in a player</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="player-name">Player name</Label>
              <Input
                id="player-name"
                list="roster-players"
                autoComplete="off"
                maxLength={MAX_PLAYER_NAME_LENGTH}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
              <datalist id="roster-players">
                {roster?.map((p) => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="player-skill">Skill level</Label>
              <Select value={String(skill)} onValueChange={(v) => setSkill(Number(v) as SkillLevel)}>
                <SelectTrigger id="player-skill" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_LEVELS.map((s) => (
                    <SelectItem key={s.value} value={String(s.value)}>
                      {skillOptionLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="player-gender">
                Gender{genderRequired ? ' (required for mixed doubles)' : ' (optional)'}
              </Label>
              <Select value={gender} onValueChange={(v) => setGender(v as GenderChoice)}>
                <SelectTrigger id="player-gender" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="h-11 w-full" disabled={!canSubmit}>
              Check in
            </Button>
          </form>
        </CardContent>
      </Card>

      <RosterCheckIn session={session} roster={roster} />

      <Card>
        <CardHeader>
          <CardTitle>
            Waiting ({session.queue.length}) · Playing ({playing})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {session.queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one is waiting.</p>
          ) : (
            <ul className="divide-y">
              {session.queue.map((id) => (
                <li key={id} className="flex items-center gap-3 py-2">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <PlayerAvatar name={session.players[id].name} editable viewable />
                    <span className="min-w-0 truncate">{session.players[id].name}</span>
                  </span>
                  <SkillBadge player={session.players[id]} display="name" onChange={(skill) => changeSkill(id, skill)} />
                  <Button variant="outline" size="sm" onClick={() => checkOutPlayer(id)}>
                    Take a break
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {session.mode === 'doubles' && <PartnersCard session={session} />}

      {session.onBreak.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>On a break ({session.onBreak.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {session.onBreak.map((id) => (
                <li key={id} className="flex items-center gap-3 py-2">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <PlayerAvatar name={session.players[id].name} editable />
                    <span className="min-w-0 truncate">{session.players[id].name}</span>
                  </span>
                  <SkillBadge player={session.players[id]} display="name" onChange={(skill) => changeSkill(id, skill)} />
                  <Button variant="outline" size="sm" onClick={() => checkInPlayer(session.players[id])}>
                    Back to queue
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
