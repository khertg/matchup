import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MATCHMAKING_MODES } from '@/lib/matchmaking'
import {
  DEFAULT_AVG_GAME_MINUTES,
  isValidGameMinutes,
  MAX_AVG_GAME_MINUTES,
  MIN_AVG_GAME_MINUTES,
} from '@/rotation/engine'
import type { GameMode, MatchmakingMode } from '@/rotation/types'
import { useSessionStore } from '@/store/session'

const MODES: { value: GameMode; label: string }[] = [
  { value: 'doubles', label: 'Doubles' },
  { value: 'singles', label: 'Singles' },
]

export function SetupScreen() {
  const startSession = useSessionStore((s) => s.startSession)
  const [location, setLocation] = useState('')
  const [courts, setCourts] = useState('4')
  const [mode, setMode] = useState<GameMode>('doubles')
  const [matchmaking, setMatchmaking] = useState<MatchmakingMode>('balanced')
  const [gameMinutes, setGameMinutes] = useState(String(DEFAULT_AVG_GAME_MINUTES))

  const courtCount = Number(courts)
  const courtsValid = Number.isInteger(courtCount) && courtCount >= 1 && courtCount <= 15
  const gameMinutesValue = Number(gameMinutes)
  const gameMinutesValid = isValidGameMinutes(gameMinutesValue)
  const formValid = courtsValid && gameMinutesValid

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!formValid) return
    startSession(location.trim() || 'Open play', mode, courtCount, {
      avgGameMinutes: gameMinutesValue,
      matchmaking: mode === 'doubles' ? matchmaking : 'balanced',
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Matchup</CardTitle>
        <CardDescription>Set up an open play session</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Open play"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="courts">Number of courts (1 to 15)</Label>
            <Input
              id="courts"
              type="number"
              inputMode="numeric"
              min={1}
              max={15}
              value={courts}
              onChange={(e) => setCourts(e.target.value)}
              aria-invalid={!courtsValid}
            />
            {!courtsValid && (
              <p className="text-sm text-destructive">Enter a whole number from 1 to 15.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label id="mode-label">Game mode</Label>
            <div role="group" aria-labelledby="mode-label" className="grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <Button
                  key={m.value}
                  type="button"
                  className="h-11"
                  variant={mode === m.value ? 'default' : 'outline'}
                  aria-pressed={mode === m.value}
                  onClick={() => setMode(m.value)}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>

          {mode === 'doubles' && (
            <div className="space-y-2">
              <Label htmlFor="matchmaking">Matchmaking</Label>
              <Select value={matchmaking} onValueChange={(v) => setMatchmaking(v as MatchmakingMode)}>
                <SelectTrigger id="matchmaking" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATCHMAKING_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {MATCHMAKING_MODES.find((m) => m.value === matchmaking)?.description}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="game-minutes">Average game length (minutes)</Label>
            <Input
              id="game-minutes"
              type="number"
              inputMode="numeric"
              min={MIN_AVG_GAME_MINUTES}
              max={MAX_AVG_GAME_MINUTES}
              value={gameMinutes}
              onChange={(e) => setGameMinutes(e.target.value)}
              aria-invalid={!gameMinutesValid}
            />
            {!gameMinutesValid && (
              <p className="text-sm text-destructive">
                Enter a whole number from {MIN_AVG_GAME_MINUTES} to {MAX_AVG_GAME_MINUTES}.
              </p>
            )}
          </div>

          <Button type="submit" className="h-11 w-full" disabled={!formValid}>
            Start session
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
