import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  courtName: string
  /** How many players are on the court; they all go back to the front of the queue. */
  players: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/** Cancelling a game cannot be undone, so it is asked about first. */
export function CancelGameDialog({ courtName, players, open, onOpenChange, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this game?</DialogTitle>
          <DialogDescription>
            The game on {courtName} is thrown away: no result, score or time is recorded. The {players}{' '}
            players go back to the front of the queue.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button autoFocus variant="outline" onClick={() => onOpenChange(false)}>
            Keep playing
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            Cancel game
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
