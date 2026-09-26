import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScoreTeams } from '@/components/ScoreDialog'
import { scoreProblem } from '@/rotation/engine'

interface Props {
  courtName: string
  /** Player names on Team A and Team B, shown so staff can check who they are correcting. */
  teamNames: [string[], string[]]
  /** The match's current score. */
  score: [number, number]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (scoreA: number, scoreB: number) => void
}

/** A blank field is not a number, so it is never a valid score. */
const parse = (text: string) => (text.trim() === '' ? NaN : Number(text))

/** Correct an already-recorded match's score. Unlike ScoreDialog, both fields start pre-filled. */
export function EditMatchScoreDialog({ courtName, teamNames, score, open, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed by score so the fields reset to the current score each time the pop-up opens. */}
        {open && (
          <EditScoreForm
            key={`${score[0]}-${score[1]}`}
            courtName={courtName}
            teamNames={teamNames}
            score={score}
            onOpenChange={onOpenChange}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditScoreForm({ courtName, teamNames, score, onOpenChange, onSubmit }: Omit<Props, 'open'>) {
  const [textA, setTextA] = useState(String(score[0]))
  const [textB, setTextB] = useState(String(score[1]))

  const a = parse(textA)
  const b = parse(textB)
  const problem = scoreProblem(a, b)
  const bothTyped = textA.trim() !== '' && textB.trim() !== ''
  const message = problem && bothTyped ? problem : null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (problem) return
    onSubmit(a, b)
    onOpenChange(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit score</DialogTitle>
        <DialogDescription>{courtName}: correct each team&apos;s score.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ScoreTeams
          teamNames={teamNames}
          fields={[
            { id: 'edit-score-a', value: textA, onChange: setTextA, invalid: message !== null },
            { id: 'edit-score-b', value: textB, onChange: setTextB, invalid: message !== null },
          ]}
        />
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        <Button type="submit" className="h-11 w-full" disabled={problem !== null}>
          Save score
        </Button>
      </form>
    </>
  )
}
