import type { PlayerAvatar } from '@/lib/avatar'
import type { RosterPlayer } from '@/rotation/types'
import { db, type Gender, type SkillLevel } from './db'

/**
 * Set or remove (null) a saved player's avatar. It is marked as not yet sent to the club, whether
 * it changed or was removed, so the cloud copy follows.
 */
export async function setRosterAvatar(playerId: number, avatar: PlayerAvatar | null): Promise<void> {
  await db.players.update(playerId, { avatar: avatar ?? undefined, avatarDirty: true })
}

/** Mark every player with a photo as not sent, so sharing photos being switched on uploads them all. */
export async function markPhotosDirty(): Promise<void> {
  await db.players.filter((p) => p.avatar?.kind === 'photo').modify({ avatarDirty: true })
}

/** Change a saved player's skill level, so they start future sessions at it. */
export async function setRosterSkill(playerId: number, skill: SkillLevel): Promise<void> {
  await db.players.update(playerId, { skill })
}

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

/** Forget which avatars are waiting to be sent to a club (they were for a different club). */
export async function clearAvatarDirty(): Promise<void> {
  await db.players.filter((p) => p.avatarDirty === true).modify({ avatarDirty: false })
}
