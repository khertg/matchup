import type { Ref } from 'react'
import { ClubLogo } from '@/components/ClubLogo'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { useSessionTitle } from '@/lib/avatars'
import type { CardColors } from '@/lib/cardPalette'
import type { Standing } from '@/rotation/standings'

interface Props {
  standing: Standing
  location: string
  date: string
  /** The picked colours (see cardColors). */
  colors: CardColors
  ref?: Ref<HTMLDivElement>
}

const MEDAL_TEXT = { gold: 'Gold medal', silver: 'Silver medal', bronze: 'Bronze medal' } as const

/**
 * Square stats card sized for Instagram, Facebook and WhatsApp. It uses the picked fixed colours
 * (`colors`), not theme tokens, so the exported image looks the same in light and dark mode.
 */
export function StatsCard({ standing, location, date, colors, ref }: Props) {
  const { name, rank, medal, wins, losses, games, winRate } = standing
  const title = useSessionTitle(location)
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
        <p className="text-sm uppercase tracking-wide opacity-80">
          {medal ? MEDAL_TEXT[medal] : `Rank #${rank}`}
        </p>
        <div className="mt-1 flex items-center gap-3">
          <PlayerAvatar name={name} size="lg" className={colors.lightText ? 'ring-2 ring-white/70' : 'ring-2 ring-black/20'} />
          <p className="min-w-0 break-words text-4xl leading-tight font-bold">{name}</p>
        </div>
        <p className="mt-1 text-lg opacity-90">
          Finished #{rank}
        </p>
        <p className="text-sm opacity-90">{title}</p>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ['Games', games],
          ['Wins', wins],
          ['Losses', losses],
          ['Win rate', `${Math.round(winRate * 100)}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg px-1 py-2" style={{ background: colors.panel }}>
            <p className="text-xl font-bold">{value}</p>
            <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
