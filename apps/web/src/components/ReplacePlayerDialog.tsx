import { ArrowRightLeft } from 'lucide-react'
import { useState } from 'react'
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
import type { RosterPlayer } from '@/rotation/types'

interface Props {
  /** The player leaving the court. */
  player: RosterPlayer
  /** Waiting players in queue order; the first is the default substitute. */
  waiting: RosterPlayer[]
  onReplace: (substituteId: number) => void
}

export function ReplacePlayerDialog({ player, waiting, onReplace }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Replace ${player.name}`}>
          <ArrowRightLeft />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace {player.name}</DialogTitle>
          <DialogDescription>
            Choose who takes their place. {player.name} will go on a break.
          </DialogDescription>
        </DialogHeader>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one is waiting to substitute. Check someone in first.
          </p>
        ) : (
          <ul className="space-y-2">
            {waiting.map((p, index) => (
              <li key={p.id}>
                <Button
                  variant="outline"
                  className="h-11 w-full justify-between"
                  onClick={() => {
                    onReplace(p.id)
                    setOpen(false)
                  }}
                >
                  <span>
                    {p.name}
                    {index === 0 && <span className="ml-2 text-xs text-muted-foreground">next in line</span>}
                  </span>
                  <Badge variant="secondary">Lv {p.skill}</Badge>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
