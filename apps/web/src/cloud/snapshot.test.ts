import { describe, expect, it } from 'vitest'
import { checkIn, createSession, recordResult } from '@/rotation/engine'
import { fillCourts } from '@/rotation/testing'
import type { SessionState } from '@/rotation/types'
import {
  parseFullBackup,
  parsePublicSnapshot,
  toFullBackup,
  toPublicSnapshot,
  toViewerState,
} from './snapshot'

function playedSession(): SessionState {
  let s = createSession('doubles', 1, { matchmaking: 'mixed' })
  for (let id = 1; id <= 5; id++) {
    s = checkIn(s, { id, name: `P${id}`, skill: 3, gender: id % 2 ? 'M' : 'F' })
  }
  return recordResult(fillCourts(s), 1, 0).state
}

describe('public snapshot', () => {
  it('leaves out genders and result history', () => {
    const snap = toPublicSnapshot('Club', playedSession())
    const json = JSON.stringify(snap)
    expect(json).not.toContain('gender')
    expect(json).not.toContain('lastResult')
    expect(snap.players[1]).toEqual({ id: 1, name: 'P1', skill: 3 })
  })

  it('round-trips through JSON and validation', () => {
    const snap = toPublicSnapshot('Club', playedSession())
    expect(parsePublicSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap)
  })

  it('rebuilds a viewer state that the display components can use', () => {
    const session = playedSession()
    const viewer = toViewerState(toPublicSnapshot('Club', session))
    expect(viewer.queue).toEqual(session.queue)
    expect(viewer.courts).toEqual(session.courts)
    expect(viewer.stats).toEqual(session.stats)
    expect(viewer.lastResult).toEqual({})
  })

  it('rejects malformed or unknown-version data instead of rendering it', () => {
    const good = toPublicSnapshot('Club', playedSession())
    const bad: unknown[] = [
      null,
      'text',
      [],
      {},
      { ...good, schemaVersion: 2 },
      { ...good, mode: 'triples' },
      { ...good, location: 42 },
      { ...good, courts: [{ id: 1, teams: [[1], 'x'] }] },
      { ...good, queue: ['a'] },
      { ...good, players: { 1: { id: 1, name: 'A', skill: 9 } } },
      { ...good, stats: null },
    ]
    for (const value of bad) expect(parsePublicSnapshot(value)).toBeNull()
  })
})

describe('full backup', () => {
  it('round-trips a session for resuming on another device', () => {
    const session = playedSession()
    const restored = parseFullBackup(JSON.parse(JSON.stringify(toFullBackup('Club', session))))
    expect(restored).toEqual({ location: 'Club', session })
  })

  it('upgrades a backup made by an older session version', () => {
    const { stats: _stats, ...old } = playedSession()
    const restored = parseFullBackup({
      schemaVersion: 1,
      storeVersion: 3,
      location: 'Club',
      session: old,
    })
    expect(restored?.session.stats).toEqual({})
  })

  it('rejects junk', () => {
    expect(parseFullBackup(null)).toBeNull()
    expect(parseFullBackup({ schemaVersion: 1, location: 'x', storeVersion: 4, session: 'no' })).toBeNull()
    expect(parseFullBackup({ schemaVersion: 9, location: 'x', storeVersion: 4, session: {} })).toBeNull()
  })
})
