import { LiveBadge } from '@/components/LiveBadge'
import { SyncBadge } from '@/components/SyncBadge'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { VersionLabel } from '@/components/VersionLabel'

/** The one branded bar shown at the top of every screen: staff and the public viewer alike. */
export function NavBar() {
  return (
    <header className="sticky top-0 z-30 border-b bg-card px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src="/favicon.svg"
            alt=""
            className="h-8 w-8 shrink-0 rounded-md object-contain"
          />
          <span className="hidden text-lg font-bold sm:inline">Q2Dink</span>
          <VersionLabel />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <LiveBadge />
          <SyncBadge />
          <ThemeSwitch />
        </div>
      </div>
    </header>
  )
}
