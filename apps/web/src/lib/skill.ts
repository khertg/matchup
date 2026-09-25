import type { SkillLevel } from '@/db/db'

/**
 * The six skill levels. `rating` is the official USA Pickleball skill rating each one lines up with
 * (usapickleball.org/skill-level), so players can pick by the number they already know.
 */
export const SKILL_LEVELS: { value: SkillLevel; label: string; rating: string }[] = [
  { value: 1, label: 'Beginner', rating: '1.0' },
  { value: 2, label: 'Novice', rating: '2.0-2.5' },
  { value: 3, label: 'Intermediate', rating: '3.0' },
  { value: 4, label: 'Upper Intermediate', rating: '3.5' },
  { value: 5, label: 'Advanced', rating: '4.0-4.5' },
  { value: 6, label: 'Expert', rating: '5.0+' },
]

export const DEFAULT_SKILL: SkillLevel = 3

export const skillLabel = (skill: SkillLevel) =>
  SKILL_LEVELS.find((s) => s.value === skill)?.label ?? 'Unknown'

/** The level as a picker shows it, for example "3 · Intermediate (3.0)". */
export const skillOptionLabel = (level: (typeof SKILL_LEVELS)[number]) =>
  `${level.value} · ${level.label} (${level.rating})`

/**
 * A court's level range in the ratings players know: "3.5+" (levels 4 to 6), "1.0–3.0" (1 to 3),
 * "3.0" (just 3). Null for any level.
 */
export function levelLabel(levels: readonly [SkillLevel, SkillLevel] | undefined): string | null {
  if (!levels) return null
  const rating = (level: SkillLevel) => SKILL_LEVELS.find((s) => s.value === level)?.rating ?? String(level)
  const [min, max] = levels
  const low = rating(min).split('-')[0].replace('+', '')
  if (max === 6) return `${low}+`
  if (min === max) return rating(min).replace('-', '–')
  const parts = rating(max).split('-')
  return `${low}–${parts[parts.length - 1]}`
}

