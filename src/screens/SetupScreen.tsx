import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { GameMode } from '@/rotation/types'
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

  const courtCount = Number(courts)
  const courtsValid = Number.isInteger(courtCount) && courtCount >= 1 && courtCount <= 15

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!courtsValid) return
    startSession(location.trim() || 'Open play', mode, courtCount)
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

          <Button type="submit" className="h-11 w-full" disabled={!courtsValid}>
            Start session
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
