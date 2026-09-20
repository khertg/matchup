import type { RosterPlayer } from '@/rotation/types'
import { db, type SkillLevel } from './db'

/**
 * Find a roster player by name (case-insensitive) or create one. If the
 * player exists with a different skill, the roster is updated to the new level.
 */
export async function addOrGetPlayer(name: string, skill: SkillLevel): Promise<RosterPlayer> {
  const trimmed = name.trim()
  const existing = await db.players.where('name').equalsIgnoreCase(trimmed).first()
  if (existing?.id !== undefined) {
    if (existing.skill !== skill) await db.players.update(existing.id, { skill })
    return { ...existing, id: existing.id, skill }
  }
  const id = await db.players.add({ name: trimmed, skill })
  if (id === undefined) throw new Error('Failed to save player')
  return { id, name: trimmed, skill }
}
