import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isValidScore, MAX_SCORE, winnerScoreProblem } from '@/rotation/engine'

interface Props {
  courtName: string
  /** The team whose win button was pressed. The pop-up is open while this is set. */
  winner: 0 | 1 | null
  /** Closed without recording anything: the game stays in play. */
  onClose: () => void
  /** Called with Team A's and Team B's score. The winner's score is always the higher one. */
  onSubmit: (scoreA: number, scoreB: number) => void
}

const TEAM_NAMES = ['Team A', 'Team B'] as const

/** A blank field is not a number, so it is never a valid score. */
const parse = (text: string) => (text.trim() === '' ? NaN : Number(text))

/** The score of a finished game. Every game is finished with one, so points always count. */
export function ScoreDialog({ courtName, winner, onClose, onSubmit }: Props) {
  return (
    <Dialog open={winner !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {/* Keyed by team so the fields start empty every time the pop-up opens. */}
        {winner !== null && (
          <ScoreForm key={winner} courtName={courtName} winner={winner} onClose={onClose} onSubmit={onSubmit} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ScoreForm({
  courtName,
  winner,
  onClose,
  onSubmit,
}: Omit<Props, 'winner'> & { winner: 0 | 1 }) {
  const [textA, setTextA] = useState('')
  const [textB, setTextB] = useState('')

  const a = parse(textA)
  const b = parse(textB)
  const problem = winnerScoreProblem(winner, a, b)
  // Say nothing while a field is still empty, unless what is already typed cannot be a score.
  const typedInvalid = (text: string, n: number) => text.trim() !== '' && !isValidScore(n)
  const bothTyped = textA.trim() !== '' && textB.trim() !== ''
  const message = problem && (bothTyped || typedInvalid(textA, a) || typedInvalid(textB, b)) ? problem : null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (problem) return
    onSubmit(a, b)
    onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{TEAM_NAMES[winner]} won</DialogTitle>
        <DialogDescription>
          {courtName}: enter each team&apos;s score. {TEAM_NAMES[winner]}&apos;s score must be the higher one.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="score-a">Team A score</Label>
            <Input
              id="score-a"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_SCORE}
              autoFocus
              value={textA}
              onChange={(e) => setTextA(e.target.value)}
              aria-invalid={typedInvalid(textA, a)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="score-b">Team B score</Label>
            <Input
              id="score-b"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_SCORE}
              value={textB}
              onChange={(e) => setTextB(e.target.value)}
              aria-invalid={typedInvalid(textB, b)}
            />
          </div>
        </div>
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        <Button type="submit" className="h-11 w-full" disabled={problem !== null}>
          Record score
        </Button>
      </form>
    </>
  )
}
