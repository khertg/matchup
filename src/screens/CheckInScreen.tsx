import { useLiveQuery } from 'dexie-react-hooks'
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
import { db, type SkillLevel } from '@/db/db'
import { addOrGetPlayer } from '@/db/roster'
import { DEFAULT_SKILL, SKILL_LEVELS, skillLabel } from '@/lib/skill'
import { playingIds } from '@/rotation/engine'
import type { SessionState } from '@/rotation/types'
import { useSessionStore } from '@/store/session'

export function CheckInScreen({ session }: { session: SessionState }) {
  const checkInPlayer = useSessionStore((s) => s.checkInPlayer)
  const checkOutPlayer = useSessionStore((s) => s.checkOutPlayer)
  const roster = useLiveQuery(() => db.players.orderBy('name').toArray(), [])

  const [name, setName] = useState('')
  const [skill, setSkill] = useState<SkillLevel>(DEFAULT_SKILL)

  function handleNameChange(value: string) {
    setName(value)
    // Returning players (picked from auto-complete) keep their saved level.
    const known = roster?.find((p) => p.name.toLowerCase() === value.trim().toLowerCase())
    if (known) setSkill(known.skill)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const player = await addOrGetPlayer(name, skill)
    const added = checkInPlayer(player)
    toast(added ? `${player.name} checked in` : `${player.name} is already checked in`)
    if (added) {
      setName('')
      setSkill(DEFAULT_SKILL)
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
            <Button type="submit" className="h-11 w-full" disabled={!name.trim()}>
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
