import { ArrowRightLeft, Coffee, MoreVerticalIcon, UserMinus } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ReplacePlayerDialog } from '@/components/ReplacePlayerDialog'
import type { RosterPlayer } from '@/rotation/types'

type SwapProps = Omit<ComponentProps<typeof ReplacePlayerDialog>, 'open' | 'onOpenChange' | 'player'> & {
  player: RosterPlayer
}

interface Props extends SwapProps {
  /** Take the player off this spot; someone else takes it. */
  onRemove?: () => void
  onTakeBreak?: () => void
  /** Why Remove cannot be done right now (it is then shown disabled with this reason). */
  removeBlocked?: string
  /** Why Take a break cannot be done right now. */
  breakBlocked?: string
}

/** The ⋮ menu on a player's tile, on a court or in Next up: Swap, Remove, Take a break. */
export function PlayerMenu({ onRemove, onTakeBreak, removeBlocked, breakBlocked, ...swap }: Props) {
  const [swapping, setSwapping] = useState(false)
  const name = swap.player.name
  const items = [
    { label: 'Swap…', icon: ArrowRightLeft, onClick: () => setSwapping(true), blocked: undefined },
    ...(onRemove ? [{ label: 'Remove', icon: UserMinus, onClick: onRemove, blocked: removeBlocked }] : []),
    ...(onTakeBreak ? [{ label: 'Take a break', icon: Coffee, onClick: onTakeBreak, blocked: breakBlocked }] : []),
  ]
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Options for ${name}`}>
            <MoreVerticalIcon aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-1">
          {items.map(({ label, icon: Icon, onClick, blocked }) => (
            <PopoverClose asChild key={label}>
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-h-9 w-full flex-col items-start gap-0 py-1.5"
                disabled={blocked !== undefined}
                onClick={onClick}
              >
                <span className="flex items-center gap-2">
                  <Icon aria-hidden="true" />
                  {label}
                </span>
                {blocked && <span className="pl-6 text-xs font-normal whitespace-normal text-muted-foreground">{blocked}</span>}
              </Button>
            </PopoverClose>
          ))}
        </PopoverContent>
      </Popover>
      <ReplacePlayerDialog {...swap} open={swapping} onOpenChange={setSwapping} />
    </>
  )
}
