import { describe, expect, it } from 'vitest'
import type { SkillLevel } from '@/db/db'
import { DEFAULT_SKILL, SKILL_LEVELS, countBySkill, levelLabel, skillLabel, skillOptionLabel } from './skill'

describe('skill levels', () => {
  it('are the six levels, named from Beginner up to Expert', () => {
    expect(SKILL_LEVELS.map((s) => [s.value, s.label])).toEqual([
      [1, 'Beginner'],
      [2, 'Novice'],
      [3, 'Intermediate'],
      [4, 'Upper Intermediate'],
      [5, 'Advanced'],
      [6, 'Expert'],
    ])
  })

  it('carry the official USA Pickleball rating they line up with', () => {
    expect(SKILL_LEVELS.map((s) => s.rating)).toEqual(['1.0', '2.0-2.5', '3.0', '3.5', '4.0-4.5', '5.0+'])
  })

  it('label a player with the plain name', () => {
    expect(skillLabel(2)).toBe('Novice')
    expect(skillLabel(5)).toBe('Advanced')
    expect(skillLabel(99 as SkillLevel)).toBe('Unknown')
  })

  it('show the rating in the picker', () => {
    expect(SKILL_LEVELS.map(skillOptionLabel)).toEqual([
      '1 · Beginner (1.0)',
      '2 · Novice (2.0-2.5)',
      '3 · Intermediate (3.0)',
      '4 · Upper Intermediate (3.5)',
      '5 · Advanced (4.0-4.5)',
      '6 · Expert (5.0+)',
    ])
  })

  it('start new players at Intermediate', () => {
    expect(DEFAULT_SKILL).toBe(3)
    expect(skillLabel(DEFAULT_SKILL)).toBe('Intermediate')
  })
})

describe('levelLabel', () => {
  it('names a court’s range in ratings', () => {
    expect(levelLabel([4, 6])).toBe('3.5+')
    expect(levelLabel([1, 3])).toBe('1.0–3.0')
    expect(levelLabel([2, 4])).toBe('2.0–3.5')
    expect(levelLabel([3, 3])).toBe('3.0')
    expect(levelLabel([5, 5])).toBe('4.0–4.5')
    expect(levelLabel([6, 6])).toBe('5.0+')
    expect(levelLabel(undefined)).toBeNull()
  })
})

describe('countBySkill', () => {
  const players = {
    1: { skill: 3 as SkillLevel },
    2: { skill: 5 as SkillLevel },
    3: { skill: 3 as SkillLevel },
    4: { skill: 1 as SkillLevel },
  }

  it('counts players per level, lowest level first, leaving out levels with nobody', () => {
    expect(countBySkill([2, 1, 3, 4], players)).toEqual([
      { level: 1, count: 1 },
      { level: 3, count: 2 },
      { level: 5, count: 1 },
    ])
  })

  it('is empty for nobody, and skips unknown players', () => {
    expect(countBySkill([], players)).toEqual([])
    expect(countBySkill([99, 2], players)).toEqual([{ level: 5, count: 1 }])
  })
})
