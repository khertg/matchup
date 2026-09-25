import type { Ref } from 'react'
import { ClubLogo } from '@/components/ClubLogo'
import { MedalBadge } from '@/components/MedalBadge'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { useSessionTitle } from '@/lib/avatars'
import type { CardColors } from '@/lib/cardPalette'
import { LAST_FRAME, rowProgress, shinePosition, shineStart } from '@/lib/standingsAnimation'
import { cn } from '@/lib/utils'
import { formatDiff, STANDINGS_PAGE_SIZE, type Medal, type Standing } from '@/rotation/standings'

interface Props {
  /** This page's players only (see pageStandings). */
  page: Standing[]
  pageNumber: number
  pageCount: number
  location: string
  date: string
  /** Shown only on the last page: the pair who played together most, if any pair repeated. */
  topPartnership?: { names: [string, string]; count: number }
  /** The picked colours (see cardColors). */
  colors: CardColors
  /**
   * Which frame of the shared animation to draw (see lib/standingsAnimation.ts): rows slide in, then a
   * light crosses the medal rows. Without it, the finished card.
   */
  frame?: number
  /** Draw the card without its player rows (their space kept), as the still background of the GIF. */
  piecesHidden?: boolean
  ref?: Ref<HTMLDivElement>
}

/** The top three rows are tinted in their medal's colour, fading into the usual row colour. */
const MEDAL_TINT: Record<Medal, string> = {
  gold: 'rgba(252, 211, 77, 0.55)',
  silver: 'rgba(226, 232, 240, 0.5)',
  bronze: 'rgba(251, 146, 60, 0.5)',
}
const MEDAL_EDGE: Record<Medal, string> = { gold: '#fcd34d', silver: '#e2e8f0', bronze: '#fb923c' }

/**
 * One page of the ranked standings, sized for a messaging app share. Uses the picked fixed colours
 * (`colors`), not theme tokens, so the exported image looks the same in light and dark mode (same
 * reasoning as StatsCard). Shows the club's name when there is one. Same fixed width as StatsCard, so every shared image (one player or the whole
 * standings) looks consistent side by side in a chat.
 *
 * When there is more than one page, every page reserves the same `STANDINGS_PAGE_SIZE` row slots
 * and the same footer line (invisible placeholders on pages with fewer players, or with nothing
 * to put in the footer) so every image in the set is exactly the same height. Without this, a
 * near-empty last page (e.g. 3 players) renders much shorter than a full one (10 players) — and
 * messaging apps that scale image previews to a shared height then display them at visibly
 * different widths too, which is the "inconsistent size" this guards against. A lone page (no
 * set to match) is left to size itself naturally.
 */
export function StandingsCard({ page, pageNumber, pageCount, location, date, topPartnership, colors, frame = LAST_FRAME, piecesHidden = false, ref }: Props) {
  const padded = pageCount > 1
  const rowSlots = padded ? STANDINGS_PAGE_SIZE : page.length
  const title = useSessionTitle(location)

  return (
    <div
      ref={ref}
      className="flex w-[360px] flex-col gap-4 p-6"
      style={{ background: colors.background, color: colors.text }}
    >
      <div className="flex items-center justify-between text-sm font-semibold tracking-widest">
        <span className="flex items-center gap-2">
          <ClubLogo className="max-h-7 max-w-24 rounded" />
          Q2DINK
        </span>
        <span className="opacity-80">{date}</span>
      </div>

      <div>
        <p className="text-2xl leading-tight font-bold">Standings</p>
        <p className="text-sm opacity-90">{title}</p>
        {pageCount > 1 && (
          <p className="text-xs uppercase tracking-wide opacity-70">
            Page {pageNumber} of {pageCount}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {Array.from({ length: rowSlots }, (_, i) => page[i]).map((row, i) =>
          row ? (
            <div
              key={row.id}
              // A moving piece of the GIF (lib/cardCapture.ts): each row slides in a frame after the one above,
              // and the light crosses the medal rows.
              data-piece=""
              data-kind="slide"
              data-start={i}
              data-shine={row.medal ? shineStart(row.medal) : undefined}
              className="relative flex items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5"
              style={{
                visibility: piecesHidden ? 'hidden' : undefined,
                background: row.medal ? `linear-gradient(90deg, ${MEDAL_TINT[row.medal]} 0%, ${colors.panel} 75%)` : colors.panel,
                boxShadow: row.medal ? `inset 3px 0 0 ${MEDAL_EDGE[row.medal]}` : undefined,
                opacity: rowProgress(frame, i),
                transform: `translateX(${(1 - rowProgress(frame, i)) * -28}px)`,
              }}
            >
              {row.medal && shinePosition(frame, row.medal) !== null && (
                // The light crossing a medal row: a soft white band moving left to right.
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 w-1/2"
                  style={{
                    left: `${-50 + shinePosition(frame, row.medal)! * 150}%`,
                    background: 'linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
                  }}
                />
              )}
              <span className="w-5 shrink-0 text-center text-sm font-bold">{row.rank}</span>
              <MedalBadge medal={row.medal} />
              <PlayerAvatar name={row.name} size="sm" />
              <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
              <span className="shrink-0 text-sm tabular-nums opacity-90">
                {row.wins}-{row.losses}
              </span>
              <span className="w-9 shrink-0 text-right text-sm tabular-nums opacity-90">{formatDiff(row)}</span>
            </div>
          ) : (
            // Reserves the same row height (the size-10 avatar sets it) on a page with fewer
            // players, so every page in the set matches.
            <div key={`empty-${i}`} aria-hidden className="invisible flex items-center gap-2 px-2 py-1.5">
              <span className="w-5 shrink-0" />
              <span className="size-10 shrink-0" />
            </div>
          ),
        )}
      </div>

      {padded ? (
        <p className={cn('text-center text-xs opacity-80', !topPartnership && 'invisible')}>
          {topPartnership
            ? `Most played together: ${topPartnership.names[0]} & ${topPartnership.names[1]} (${topPartnership.count}×)`
            : 'placeholder'}
        </p>
      ) : (
        topPartnership && (
          <p className="text-center text-xs opacity-80">
            Most played together: {topPartnership.names[0]} &amp; {topPartnership.names[1]} ({topPartnership.count}×)
          </p>
        )
      )}
    </div>
  )
}
