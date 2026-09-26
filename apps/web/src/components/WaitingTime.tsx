import { formatDuration } from '@/lib/time'

/** How long someone has been waiting so far ("Waiting" on hover). */
export function WaitingTime({ seconds, className = '' }: { seconds: number; className?: string }) {
  return (
    <span title="Waiting" className={`inline-flex shrink-0 items-center text-muted-foreground ${className}`}>
      {formatDuration(seconds)}
    </span>
  )
}
