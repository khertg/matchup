import type { ClubRosterPlayer } from '@q2dink/shared'
import type { PlayerAvatar } from '@/lib/avatar'
import { cleanPlayerName } from '@/rotation/engine'
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
  await db.players.update(playerId, { skill, rosterDirty: true })
}

/**
 * The saved players of one club, or, with no club (a build with no cloud), the ones no club has
 * taken. Every roster lookup goes through this, so one club never sees another's players.
 */
function clubPlayers(clubSlug: string | undefined) {
  return clubSlug === undefined
    ? db.players.filter((p) => p.clubSlug === undefined)
    : db.players.where('clubSlug').equals(clubSlug)
}

/** A club's saved players, alphabetical. */
export async function listRoster(clubSlug: string | undefined): Promise<RosterPlayer[]> {
  const players = (await clubPlayers(clubSlug).toArray()) as RosterPlayer[]
  return players.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

const findByName = (clubSlug: string | undefined, name: string) => {
  const key = name.trim().toLowerCase()
  return clubPlayers(clubSlug)
    .filter((p) => p.name.toLowerCase() === key)
    .first()
}

/**
 * The first club to sync on this device takes the players no club has yet, and they are marked to be
 * sent, so a device's existing roster reaches its club once. Returns how many were taken.
 */
export async function claimUnownedPlayers(clubSlug: string): Promise<number> {
  return db.players.filter((p) => p.clubSlug === undefined).modify({ clubSlug, rosterDirty: true })
}

/** A club's players whose changes have not been sent to it yet. */
export async function dirtyRoster(clubSlug: string): Promise<RosterPlayer[]> {
  return (await clubPlayers(clubSlug)
    .filter((p) => p.rosterDirty === true)
    .toArray()) as RosterPlayer[]
}

/**
 * The club now has these players as they were sent: mark them sent, unless one changed again while
 * the upload was on its way (then it stays marked, and goes next time).
 */
export async function markRosterSent(sent: RosterPlayer[]): Promise<void> {
  await db.transaction('rw', db.players, async () => {
    for (const s of sent) {
      const now = await db.players.get(s.id)
      if (now && now.name === s.name && now.skill === s.skill && now.gender === s.gender) {
        await db.players.update(s.id, { rosterDirty: false })
      }
    }
  })
}

/**
 * Bring in the club's roster as other devices left it. A player this device has not saved for the club
 * is added; one it has is updated to the club's skill and gender, unless it changed here and has not
 * been sent yet (this device's change goes up next and wins). Avatars and totals are never touched.
 */
export async function mergeClubRoster(clubSlug: string, players: ClubRosterPlayer[]): Promise<void> {
  await db.transaction('rw', db.players, async () => {
    for (const p of players) {
      const skill = p.skill as SkillLevel
      const local = await findByName(clubSlug, p.name)
      if (!local) {
        await db.players.add({ name: p.name, skill, gender: p.gender, clubSlug, rosterDirty: false })
      } else if (!local.rosterDirty && (local.skill !== skill || local.gender !== p.gender)) {
        await db.players.update(local.id!, { skill, gender: p.gender })
      }
    }
  })
}

/**
 * Rename a saved player. The new name is trimmed and must not belong to another saved player of the
 * same club (ignoring case); changing only the capitals of their own name is fine. Their totals and
 * avatar stay with them. Returns the old and new names, and throws a RangeError with a readable
 * message when the name is not allowed.
 */
export async function renameRosterPlayer(playerId: number, name: string): Promise<{ from: string; to: string }> {
  const to = cleanPlayerName(name)
  const player = await db.players.get(playerId)
  if (!player) throw new Error('This player is not saved on this device')
  const clash = await findByName(player.clubSlug, to)
  if (clash && clash.id !== playerId) throw new RangeError(`${to} is already saved as a player`)
  if (player.name !== to) await db.players.update(playerId, { name: to, rosterDirty: true })
  return { from: player.name, to }
}

/**
 * Find one of the club's saved players by name (case-insensitive) or create one for that club. An
 * existing player is updated when the skill level, or a newly supplied gender, differs.
 */
export async function addOrGetPlayer(
  name: string,
  skill: SkillLevel,
  gender?: Gender,
  clubSlug?: string,
): Promise<RosterPlayer> {
  const trimmed = name.trim()
  const existing = await findByName(clubSlug, trimmed)
  if (existing?.id !== undefined) {
    const changes: { skill?: SkillLevel; gender?: Gender } = {}
    if (existing.skill !== skill) changes.skill = skill
    if (gender && existing.gender !== gender) changes.gender = gender
    if (Object.keys(changes).length > 0) await db.players.update(existing.id, { ...changes, rosterDirty: true })
    // Only identity fields go into a session; all-time totals stay on the roster.
    return {
      id: existing.id,
      name: existing.name,
      skill: changes.skill ?? existing.skill,
      gender: changes.gender ?? existing.gender,
    }
  }
  const id = await db.players.add({ name: trimmed, skill, gender, rosterDirty: true, ...(clubSlug ? { clubSlug } : {}) })
  if (id === undefined) throw new Error('Failed to save player')
  return { id, name: trimmed, skill, gender }
}

/** Forget which avatars are waiting to be sent to a club (they were for a different club). */
export async function clearAvatarDirty(): Promise<void> {
  await db.players.filter((p) => p.avatarDirty === true).modify({ avatarDirty: false })
}
