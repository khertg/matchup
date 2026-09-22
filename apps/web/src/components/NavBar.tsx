import { ThemeSwitch } from '@/components/ThemeSwitch'
import { useClubLogo, useClubName } from '@/lib/avatars'

/** The one branded bar shown at the top of every screen: staff and the public viewer alike. */
export function NavBar() {
  const logo = useClubLogo()
  const clubName = useClubName()

  return (
    <header className="border-b bg-card px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src={logo ?? '/favicon.svg'}
            alt=""
            data-testid={logo ? 'club-logo' : undefined}
            className="h-8 w-8 shrink-0 rounded-md object-contain"
          />
          <span className="hidden text-lg font-bold sm:inline">Q2Dink</span>
          {clubName && <span className="truncate text-muted-foreground">{clubName}</span>}
        </div>
        <ThemeSwitch />
      </div>
    </header>
  )
}
