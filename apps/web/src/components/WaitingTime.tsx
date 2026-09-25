import { Hourglass } from 'lucide-react'
import { formatDuration } from '@/lib/time'

/**
 * How long someone has been waiting so far, with a slowly turning hourglass (still for reduced
 * motion). A wait that is over, on a court, uses the History icon instead.
 */
export function WaitingTime({ seconds, className = '' }: { seconds: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-muted-foreground ${className}`}>
      <Hourglass className="size-3 motion-safe:animate-hourglass" aria-label="Waiting" />
      {formatDuration(seconds)}
    </span>
  )
}
