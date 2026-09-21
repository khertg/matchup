import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { checkIn, createSession, recordResult } from '@/rotation/engine'
import { lifetimeTotals } from '@/rotation/lifetime'
import { fillCourts } from '@/rotation/testing'
import type { SessionState } from '@/rotation/types'
import { SESSION_STORE_VERSION } from '@/store/migrate'
import { db } from './db'
import {
  archiveSession,
  deleteHistory,
  getHistory,
  listHistory,
  markHistorySynced,
  MAX_HISTORY,
  unsyncedHistory,
} from './history'

beforeEach(async () => {
  await db.history.clear()
})

function session(players = 4, games = 1): SessionState {
  let s = createSession('doubles', 1)
  for (let id = 1; id <= players; id++) s = checkIn(s, { id, name: `P${id}`, skill: 3 })
  for (let g = 0; g < games; g++) s = recordResult(fillCourts(s), 1, 0).state
  return s
}

const archive = (id: string, s: SessionState, now = 1_000, counted = {}) =>
  archiveSession({ id, location: 'Club', startedAt: 500, session: s, lifetimeCounted: counted, now })

describe('archiveSession', () => {
  it('keeps the session as it ended, with a summary', async () => {
    const s = session(6, 2)
    const record = await archive('a', s, 2_000, lifetimeTotals(s))
    expect(record).toMatchObject({
      id: 'a',
      location: 'Club',
      startedAt: 500,
      endedAt: 2_000,
      mode: 'doubles',
      players: 6,
      games: 2,
      storeVersion: SESSION_STORE_VERSION,
      synced: false,
    })
    const stored = await getHistory('a')
    expect(stored?.session).toEqual(s)
    expect(stored?.lifetimeCounted).toEqual(lifetimeTotals(s))
  })

  it('counts games, not player-games', async () => {
    expect((await archive('a', session(4, 3)))?.games).toBe(3)
    let singles = createSession('singles', 1)
    for (let id = 1; id <= 2; id++) singles = checkIn(singles, { id, name: `P${id}`, skill: 3 })
    singles = recordResult(fillCourts(singles), 1, 0).state
    expect((await archive('b', singles))?.games).toBe(1)
  })

  it('saves nothing when nobody ever checked in', async () => {
    expect(await archive('a', createSession('doubles', 2))).toBeNull()
    expect(await db.history.count()).toBe(0)
  })

  it('replaces the record when the same session ends again', async () => {
    await archive('a', session(4, 1), 1_000)
    await markHistorySynced('a')
    await archive('a', session(4, 3), 5_000)
    expect(await db.history.count()).toBe(1)
    const stored = await getHistory('a')
    expect(stored).toMatchObject({ games: 3, endedAt: 5_000, synced: false })
  })

  it('keeps only the newest sessions', async () => {
    for (let n = 1; n <= MAX_HISTORY + 5; n++) await archive(`s${n}`, session(4, 0), n)
    expect(await db.history.count()).toBe(MAX_HISTORY)
    expect(await getHistory('s1')).toBeUndefined()
    expect(await getHistory('s5')).toBeUndefined()
    expect(await getHistory('s6')).toBeDefined()
    expect(await getHistory(`s${MAX_HISTORY + 5}`)).toBeDefined()
  })
})

describe('listHistory', () => {
  it('is newest first and leaves out the sessions themselves', async () => {
    await archive('old', session(), 1_000)
    await archive('new', session(), 9_000)
    await archive('mid', session(), 5_000)
    const list = await listHistory()
    expect(list.map((r) => r.id)).toEqual(['new', 'mid', 'old'])
    for (const row of list) {
      expect(row).not.toHaveProperty('session')
      expect(row).not.toHaveProperty('lifetimeCounted')
    }
  })
})

describe('sync bookkeeping', () => {
  it('lists what the club does not have yet, until it is marked as sent', async () => {
    await archive('a', session(), 1_000)
    await archive('b', session(), 2_000)
    expect((await unsyncedHistory()).map((r) => r.id).sort()).toEqual(['a', 'b'])
    await markHistorySynced('a')
    expect((await unsyncedHistory()).map((r) => r.id)).toEqual(['b'])
  })

  it('deletes a session', async () => {
    await archive('a', session())
    await deleteHistory('a')
    expect(await getHistory('a')).toBeUndefined()
    await deleteHistory('a') // already gone is fine
  })
})
