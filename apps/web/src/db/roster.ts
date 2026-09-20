import type { RosterPlayer } from '@/rotation/types'
import { db, type Gender, type SkillLevel } from './db'

/**
 * Find a roster player by name (case-insensitive) or create one. An existing
 * player is updated when the skill level, or a newly supplied gender, differs.
 */
export async function addOrGetPlayer(
  name: string,
  skill: SkillLevel,
  gender?: Gender,
): Promise<RosterPlayer> {
  const trimmed = name.trim()
  const existing = await db.players.where('name').equalsIgnoreCase(trimmed).first()
  if (existing?.id !== undefined) {
    const changes: { skill?: SkillLevel; gender?: Gender } = {}
    if (existing.skill !== skill) changes.skill = skill
    if (gender && existing.gender !== gender) changes.gender = gender
    if (Object.keys(changes).length > 0) await db.players.update(existing.id, changes)
    // Only identity fields go into a session; all-time totals stay on the roster.
    return {
      id: existing.id,
      name: existing.name,
      skill: changes.skill ?? existing.skill,
      gender: changes.gender ?? existing.gender,
    }
  }
  const id = await db.players.add({ name: trimmed, skill, gender })
  if (id === undefined) throw new Error('Failed to save player')
  return { id, name: trimmed, skill, gender }
}
