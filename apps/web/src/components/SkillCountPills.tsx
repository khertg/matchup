import { Badge } from '@/components/ui/badge'
import type { SkillLevel } from '@/db/db'
import { countBySkill, SKILL_LEVELS } from '@/lib/skill'

interface Props {
  ids: readonly number[]
  players: Readonly<Record<number, { skill: SkillLevel } | undefined>>
  /** What is being counted, for screen readers, e.g. "Waiting per level". */
  label: string
}

/** How many players there are at each level, as "Lv 3 · 4" pills. Levels with nobody are left out. */
export function SkillCountPills({ ids, players, label }: Props) {
  const counts = countBySkill(ids, players)
  if (counts.length === 0) return null
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1">
      {counts.map(({ level, count }) => {
        const info = SKILL_LEVELS.find((s) => s.value === level)
        const description = `${info?.label} (${info?.rating}): ${count} ${count === 1 ? 'player' : 'players'}`
        return (
          <li key={level}>
            <Badge variant="outline" className="tabular-nums" title={description} aria-label={description}>
              Lv {level} · {count}
            </Badge>
          </li>
        )
      })}
    </ul>
  )
}
