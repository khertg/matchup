import { ChevronDown, ChevronUp, Plus, SlidersHorizontal, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MAX_COURTS, MAX_COURT_NAME_LENGTH, MIN_COURTS } from '@/rotation/engine'
import type { Court, SessionState } from '@/rotation/types'
import { useSessionStore } from '@/store/session'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

interface RowProps {
  court: Court
  index: number
  count: number
}

/** One court: rename it, move it, or close it (asking first if a game is in progress). */
function CourtRow({ court, index, count }: RowProps) {
  const renameCourt = useSessionStore((s) => s.renameCourt)
  const moveCourt = useSessionStore((s) => s.moveCourt)
  const closeCourt = useSessionStore((s) => s.closeCourt)
  // While editing, the typed text; otherwise null so the field follows the court's real name.
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const isLast = count <= MIN_COURTS

  function commitName(event?: FormEvent) {
    event?.preventDefault()
    if (draft === null || draft === court.name) {
      setDraft(null)
      setError(null)
      return
    }
    try {
      renameCourt(court.id, draft)
      setDraft(null)
      setError(null)
    } catch (err) {
      setError(messageOf(err)) // keep what was typed so it can be fixed
    }
  }

  function close() {
    closeCourt(court.id)
    toast(`${court.name} closed`)
  }

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <form onSubmit={commitName} className="flex items-center gap-2">
        <Input
          aria-label={`Name of ${court.name}`}
          value={draft ?? court.name}
          maxLength={MAX_COURT_NAME_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commitName()}
          aria-invalid={error !== null}
        />
        <Badge variant={court.teams ? 'default' : 'outline'}>{court.teams ? 'In play' : 'Open'}</Badge>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Move ${court.name} up`}
          disabled={index === 0}
          onClick={() => moveCourt(court.id, -1)}
        >
          <ChevronUp /> Up
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Move ${court.name} down`}
          disabled={index === count - 1}
          onClick={() => moveCourt(court.id, 1)}
        >
          <ChevronDown /> Down
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Close ${court.name}`}
          title={isLast ? 'A session needs at least one court' : undefined}
          disabled={isLast}
          onClick={() => (court.teams ? setConfirming(true) : close())}
        >
          <X /> Close
        </Button>
      </div>

      {confirming && (
        <div
          role="group"
          aria-label={`Confirm closing ${court.name}`}
          className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
        >
          <p className="text-sm">
            Cancel the game and close {court.name}? Its players go back to the front of the queue and
            no result is recorded.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" size="sm" onClick={close}>
              Cancel game and close
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)}>
              Keep court
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

/** Add a court. It lives only in the Manage courts dialog, beside renaming, reordering and closing. */
function AddCourtButton({ session }: { session: SessionState }) {
  const addCourt = useSessionStore((s) => s.addCourt)
  const atLimit = session.courts.length >= MAX_COURTS

  function handleAdd() {
    addCourt()
    const added = useSessionStore.getState().session?.courts.at(-1)
    toast(`${added?.name ?? 'Court'} added`)
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" onClick={handleAdd} disabled={atLimit}>
        <Plus /> Add court
      </Button>
      {atLimit && <p className="text-xs text-muted-foreground">Maximum of {MAX_COURTS} courts</p>}
    </div>
  )
}

export function ManageCourtsDialog({ session }: { session: SessionState }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <SlidersHorizontal /> Manage courts
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage courts</DialogTitle>
          <DialogDescription>
            Rename, reorder or close courts. New games go to the first open court in this order.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {session.courts.map((court, index) => (
            <CourtRow key={court.id} court={court} index={index} count={session.courts.length} />
          ))}
        </ul>

        <AddCourtButton session={session} />
      </DialogContent>
    </Dialog>
  )
}
