import { useClubLogo } from '@/lib/avatars'
import { cn } from '@/lib/utils'

/** The club logo where it is shown, or nothing at all when the club has none. */
export function ClubLogo({ className, name = 'Club' }: { className?: string; name?: string }) {
  const src = useClubLogo()
  if (!src) return null
  return (
    <img
      src={src}
      alt={`${name} logo`}
      data-testid="club-logo"
      className={cn('max-h-14 w-auto max-w-40 shrink-0 rounded-md object-contain', className)}
    />
  )
}
