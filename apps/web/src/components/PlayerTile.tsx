import { Lock } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { TEAM_BOX, TEAM_NAMES } from '@/lib/teams'
import { cn } from '@/lib/utils'

/** Every player spot on a court or in Next up is a tile of this height, filled or open. */
const TILE = 'flex min-h-14 items-center gap-2 rounded-lg px-2 py-1.5'

/** One player's spot on a team: a rectangle around their avatar, name, badges and menu. */
export function PlayerTile({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn(TILE, 'border bg-card', className)}>{children}</li>
}

const OPEN = 'justify-center border-2 border-dashed border-muted-foreground/30 text-sm text-muted-foreground/70'

/**
 * An empty spot: a dashed rectangle with a faint "Open". The word is drawn from a data attribute,
 * like avatar initials, so it adds no text to the card (tests and lists read only players' names).
 * With `onFill` (staff) the whole tile is a button to choose who takes the spot.
 */
export function OpenTile({ onFill, fillLabel }: { onFill?: () => void; fillLabel?: string }) {
  if (!onFill) {
    return (
      <li
        role="img"
        aria-label="Open spot"
        data-label="Open"
        className={cn(TILE, OPEN, 'before:content-[attr(data-label)]')}
      />
    )
  }
  return (
    <li>
      <button
        type="button"
        aria-label={fillLabel}
        data-label="Open · tap to fill"
        onClick={onFill}
        className={cn(
          TILE,
          OPEN,
          'w-full cursor-pointer bg-card/40 transition-colors before:content-[attr(data-label)] hover:border-primary hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        )}
      />
    </li>
  )
}

/**
 * One team of a game, in its colour (Blue or Orange; the name is its label for screen readers and
 * tests, not text on the card): its tiles, then `footer` (the Won button) across the bottom.
 */
export function TeamBox({
  team,
  children,
  locked = false,
  footer,
}: {
  team: 0 | 1
  children: ReactNode
  /** The two are locked partners. */
  locked?: boolean
  footer?: ReactNode
}) {
  return (
    <div role="group" aria-label={TEAM_NAMES[team]} className={cn('relative space-y-2 rounded-xl p-2', TEAM_BOX[team])}>
      {locked && (
        <Lock className="absolute -top-1.5 right-2 size-3.5 rounded-full bg-card p-0.5 text-muted-foreground" aria-label="Locked partners" />
      )}
      <ul className="space-y-2">{children}</ul>
      {footer}
    </div>
  )
}

/** The small "vs" between two teams, drawn from a data attribute so it adds no text to the card. */
export function Versus() {
  return (
    <p
      aria-hidden="true"
      data-label="vs"
      className="text-center text-xs font-semibold text-muted-foreground uppercase before:content-[attr(data-label)]"
    />
  )
}

/**
 * Two teams of open spots, as on an open court or while no group can be formed. With `onFill`
 * (staff) each spot can be tapped to choose who takes it.
 */
export function EmptyTeams({
  perTeam,
  stacked = false,
  onFill,
}: {
  perTeam: number
  stacked?: boolean
  onFill?: (team: 0 | 1, slot: number) => void
}) {
  return (
    <div className={cn('grid gap-2 text-left', !stacked && 'sm:grid-cols-2 sm:gap-3')} role="group" aria-label="Open spots">
      {([0, 1] as const).map((team) => (
        <Fragment key={team}>
          {stacked && team === 1 && <Versus />}
          <TeamBox team={team}>
            {Array.from({ length: perTeam }, (_, i) => (
              <OpenTile
                key={i}
                onFill={onFill && (() => onFill(team, i))}
                fillLabel={`Fill open spot on ${TEAM_NAMES[team]}`}
              />
            ))}
          </TeamBox>
        </Fragment>
      ))}
    </div>
  )
}
