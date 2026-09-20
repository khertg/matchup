import { useLiveQuery } from 'dexie-react-hooks'
import { Lock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { db, type Gender, type SkillLevel } from '@/db/db'
import { addOrGetPlayer } from '@/db/roster'
import { DEFAULT_SKILL, SKILL_LEVELS, skillLabel } from '@/lib/skill'
import { playingIds } from '@/rotation/engine'
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

  const locked = new Set(session.partners.flat())
  const available = Object.values(session.players).filter((p) => !locked.has(p.id))
  const canLock = first !== '' && second !== '' && first !== second

  function handleLock() {
    const a = Number(first)
    const b = Number(second)
    lockPartners(a, b)
    toast(`${session.players[a].name} and ${session.players[b].name} are now partners`)
    setFirst('')
    setSecond('')
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

        {session.partners.length > 0 && (
          <ul className="divide-y">
            {session.partners.map(([a, b]) => (
              <li key={`${a}-${b}`} className="flex items-center gap-3 py-2">
                <Lock className="size-4 text-muted-foreground" aria-hidden />
                <span className="flex-1">
                  {session.players[a].name} &amp; {session.players[b].name}
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
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function CheckInScreen({ session }: { session: SessionState }) {
  const checkInPlayer = useSessionStore((s) => s.checkInPlayer)
  const checkOutPlayer = useSessionStore((s) => s.checkOutPlayer)
  const roster = useLiveQuery(() => db.players.orderBy('name').toArray(), [])

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
    const player = await addOrGetPlayer(name, skill, gender === 'U' ? undefined : gender)
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
                      {s.value} · {s.label}
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
                  <span className="flex-1">{session.players[id].name}</span>
                  <Badge variant="secondary">{skillLabel(session.players[id].skill)}</Badge>
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
                  <span className="flex-1">{session.players[id].name}</span>
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
