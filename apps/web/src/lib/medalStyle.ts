import type { Medal } from '@/rotation/standings'

export interface MedalStyle {
  /** "Gold", "Silver" or "Bronze". */
  label: string
  /** The medal's solid colour: pills, borders and avatar rings. */
  color: string
  /** A see-through wash of the medal's colour, laid over a row's usual background. */
  tint: string
  /** Dark text that reads on `color`. */
  ink: string
}

const STYLES: Record<Medal, MedalStyle> = {
  gold: { label: 'Gold', color: '#fbbf24', tint: 'rgba(251, 191, 36, 0.45)', ink: '#422006' },
  silver: { label: 'Silver', color: '#cbd5e1', tint: 'rgba(203, 213, 225, 0.45)', ink: '#1e293b' },
  bronze: { label: 'Bronze', color: '#f97316', tint: 'rgba(249, 115, 22, 0.4)', ink: '#431407' },
}

/**
 * How a medallist is picked out on the shared images (the standings and stats cards), whatever colours
 * were picked for the card. Null for everyone else, who is drawn as usual.
 */
export function medalStyle(medal: Medal | null): MedalStyle | null {
  return medal ? STYLES[medal] : null
}

/** The medal's colour laid over a row's usual background, as one CSS background. */
export const medalRowBackground = (style: MedalStyle, panel: string) =>
  `linear-gradient(${style.tint}, ${style.tint}), ${panel}`
