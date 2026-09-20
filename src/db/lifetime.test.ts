import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { assignCourts, checkIn, createSession, recordResult } from '@/rotation/engine'
import type { SessionState } from '@/rotation/types'
import { db } from './db'
import { saveLifetimeStats } from './lifetime'
import { addOrGetPlayer } from './roster'

beforeEach(async () => {
  await db.players.clear()
})

async function playOneGame(names: string[]): Promise<SessionState> {
  let s = createSession('doubles', 1)
  for (const name of names) s = checkIn(s, await addOrGetPlayer(name, 3))
  return recordResult(assignCourts(s), 1, 0).state
}

describe('addOrGetPlayer', () => {
  it('reuses a player by name, ignoring case and surrounding spaces', async () => {
    const first = await addOrGetPlayer('Ann', 3)
    const again = await addOrGetPlayer('  ann ', 3)
    expect(again.id).toBe(first.id)
    expect(await db.players.count()).toBe(1)
  })

  it('updates the saved skill and gender when they change', async () => {
    await addOrGetPlayer('Ann', 3)
    const updated = await addOrGetPlayer('Ann', 5, 'F')
    expect(updated).toMatchObject({ skill: 5, gender: 'F' })
    expect(await db.players.get(updated.id)).toMatchObject({ skill: 5, gender: 'F' })
  })

  it('keeps a saved gender when none is supplied', async () => {
    await addOrGetPlayer('Ann', 3, 'F')
    expect((await addOrGetPlayer('Ann', 3)).gender).toBe('F')
  })

  it('returns only identity fields, not all-time totals', async () => {
    const created = await addOrGetPlayer('Ann', 3)
    await db.players.update(created.id, { games: 9, wins: 5, losses: 4 })
    const again = await addOrGetPlayer('Ann', 3)
    expect(Object.keys(again).sort()).toEqual(['gender', 'id', 'name', 'skill'])
  })
})

describe('saveLifetimeStats', () => {
  it('adds a session to the roster totals and accumulates across sessions', async () => {
    const session = await playOneGame(['A', 'B', 'C', 'D'])
    await saveLifetimeStats(session)
    await saveLifetimeStats(session)

    const players = await db.players.toArray()
    expect(players).toHaveLength(4)
    for (const p of players) expect(p.games).toBe(2)
    expect(players.reduce((sum, p) => sum + (p.wins ?? 0), 0)).toBe(4)
    expect(players.reduce((sum, p) => sum + (p.losses ?? 0), 0)).toBe(4)
  })

  it('skips players who have no games and players missing from the roster', async () => {
    const session = await playOneGame(['A', 'B', 'C', 'D'])
    const withGhost: SessionState = {
      ...session,
      stats: { ...session.stats, 999: { games: 3, wins: 3, losses: 0, opponentSkill: 9 } },
    }
    await saveLifetimeStats(withGhost)
    expect(await db.players.count()).toBe(4)
  })
})
