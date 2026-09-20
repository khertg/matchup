import type { SkillLevel } from '@/db/db'

export const SKILL_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 1, label: 'Beginner' },
  { value: 2, label: 'Advanced Beginner' },
  { value: 3, label: 'Intermediate' },
  { value: 4, label: 'Upper Intermediate' },
  { value: 5, label: 'Advanced' },
  { value: 6, label: 'Expert' },
]

export const DEFAULT_SKILL: SkillLevel = 3

export const skillLabel = (skill: SkillLevel) =>
  SKILL_LEVELS.find((s) => s.value === skill)?.label ?? 'Unknown'
