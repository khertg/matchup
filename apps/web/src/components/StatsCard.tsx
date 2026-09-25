import type { CSSProperties, Ref } from 'react'
import { ClubLogo } from '@/components/ClubLogo'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { useSessionTitle } from '@/lib/avatars'
import { pieceProgress, pieceStyle, shineProgress } from '@/lib/cardAnimation'
import type { CardColors } from '@/lib/cardPalette'
import { STATS_LAST_FRAME, STATS_PIECES, STATS_SHINE_START, STATS_TIMING, type StatsPiece } from '@/lib/statsAnimation'
import type { Standing } from '@/rotation/standings'

interface Props {
  standing: Standing
  location: string
  date: string
  /** The picked colours (see cardColors). */
  colors: CardColors
  /**
   * Which frame of the shared animation to draw (lib/statsAnimation.ts): the parts of the card arrive one
   * after another, then a light crosses a medallist's name. Without it, the finished card.
   */
  frame?: number
  /** Draw the card without its moving parts (their space kept), as the still background of the GIF. */
  piecesHidden?: boolean
  ref?: Ref<HTMLDivElement>
}

/** A medallist's avatar ring, in their medal's colour. */
const MEDAL_RING = { gold: '#fcd34d', silver: '#e2e8f0', bronze: '#fb923c' } as const

const MEDAL_TEXT = { gold: 'Gold medal', silver: 'Silver medal', bronze: 'Bronze medal' } as const

/**
 * Square stats card sized for Instagram, Facebook and WhatsApp. It uses the picked fixed colours
 * (`colors`), not theme tokens, so the exported image looks the same in light and dark mode.
 */
export function StatsCard({ standing, location, date, colors, frame = STATS_LAST_FRAME, piecesHidden = false, ref }: Props) {
  const { name, rank, medal, wins, losses, games, winRate } = standing
  const title = useSessionTitle(location)
  const shine = medal ? shineProgress(frame, STATS_SHINE_START, STATS_TIMING.shineFrames) : null

  /**
   * A moving part of the card: where the animation has it at this frame, and marked for the GIF maker
   * (lib/cardCapture.ts), which moves it as a picture.
   */
  const piece = (part: StatsPiece, lit = false) => {
    const { kind, start } = STATS_PIECES[part]
    const style: CSSProperties = piecesHidden
      ? { visibility: 'hidden' }
      : pieceStyle(kind, pieceProgress(frame, start, STATS_TIMING.pieceFrames))
    return {
      'data-piece': '',
      'data-kind': kind,
      'data-start': start,
      ...(lit ? { 'data-shine': STATS_SHINE_START } : {}),
      style,
    }
  }
  const avatarPart = piece('avatar')
  return (
    <div
      ref={ref}
      className="flex h-[360px] w-[360px] flex-col justify-between p-6"
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
        <p {...piece('rank')} className="w-fit text-sm uppercase tracking-wide opacity-80">
          {medal ? MEDAL_TEXT[medal] : `Rank #${rank}`}
        </p>
        <div className="mt-1 flex items-center gap-3">
          <span
            {...avatarPart}
            className="shrink-0 rounded-full"
            // A medallist's ring is their medal's colour.
            style={{ ...avatarPart.style, ...(medal ? { boxShadow: `0 0 0 4px ${MEDAL_RING[medal]}` } : {}) }}
          >
            <PlayerAvatar
              name={name}
              size="lg"
              className={medal ? undefined : colors.lightText ? 'ring-2 ring-white/70' : 'ring-2 ring-black/20'}
            />
          </span>
          <p {...piece('name', !!medal)} className="relative min-w-0 flex-1 overflow-hidden rounded-lg break-words text-4xl leading-tight font-bold">
            {name}
            {shine !== null && (
              // The light crossing a medallist's name, as in the GIF.
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 w-1/2"
                style={{
                  left: `${-50 + shine * 150}%`,
                  background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0) 100%)',
                }}
              />
            )}
          </p>
        </div>
        <p {...piece('finished')} className="mt-1 w-fit text-lg opacity-90">
          Finished #{rank}
        </p>
        <p {...piece('title')} className="w-fit text-sm opacity-90">{title}</p>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ['Games', games],
          ['Wins', wins],
          ['Losses', losses],
          ['Win rate', `${Math.round(winRate * 100)}%`],
        ].map(([label, value], i) => {
          const part = piece(`stat${i}` as StatsPiece)
          return (
          <div key={label} {...part} className="rounded-lg px-1 py-2" style={{ ...part.style, background: colors.panel }}>
            <p className="text-xl font-bold">{value}</p>
            <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
          </div>
          )
        })}
      </div>
    </div>
  )
}
