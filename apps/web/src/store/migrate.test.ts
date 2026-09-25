import { describe, expect, it } from 'vitest'
import { createSession } from '@/rotation/engine'
import { migrateSession, SESSION_STORE_VERSION } from './migrate'

describe('migrateSession', () => {
  it('passes a null session through', () => {
    expect(migrateSession(null, 1)).toBeNull()
  })

  it('adds the default game length to a v1 session', () => {
    const {
      avgGameMinutes: _a,
      matchmaking: _m,
      partners: _p,
      lastResult: _l,
      stats: _s,
      ...legacy
    } = createSession('doubles', 2)
    const migrated = migrateSession(legacy as never, 1)
    expect(migrated?.avgGameMinutes).toBe(12)
    expect(migrated?.matchmaking).toBe('balanced')
    expect(migrated?.partners).toEqual([])
    expect(migrated?.lastResult).toEqual({})
    expect(migrated?.stats).toEqual({})
    expect(migrated?.courts).toHaveLength(2)
  })

  it('upgrades a v2 session with the matchmaking defaults', () => {
    const { matchmaking: _m, partners: _p, lastResult: _l, stats: _s, ...v2 } = createSession('doubles', 1)
    const migrated = migrateSession(v2 as never, 2)
    expect(migrated).toMatchObject({ matchmaking: 'balanced', partners: [], lastResult: {}, stats: {} })
  })

  it('names the courts of a v4 session Court <id>, keeping everything else', () => {
    const current = createSession('doubles', 2, { matchmaking: 'skill' })
    const v4 = { ...current, courts: current.courts.map(({ id, teams }) => ({ id, teams })) }
    const migrated = migrateSession(v4 as never, 4)
    expect(migrated?.courts.map((c) => c.name)).toEqual(['Court 1', 'Court 2'])
    expect(migrated?.courts.map((c) => c.id)).toEqual([1, 2])
    expect(migrated?.matchmaking).toBe('skill')
  })

  it('keeps the names of a session that already has them', () => {
    const named = createSession('doubles', 2)
    named.courts[1].name = 'Center Court'
    expect(migrateSession(named, 4)?.courts[1].name).toBe('Center Court')
  })

  it('adds empty stats to a v3 session without touching its other fields', () => {
    const { stats: _s, ...v3 } = createSession('doubles', 1, { matchmaking: 'mixed' })
    const migrated = migrateSession(v3 as never, 3)
    expect(migrated?.stats).toEqual({})
    expect(migrated?.matchmaking).toBe('mixed')
  })

  describe('v6 to v7: scores and time played', () => {
    const v6Stats = { games: 3, wins: 2, losses: 1, opponentSkill: 9 }
    const v6 = () => ({
      ...createSession('doubles', 1),
      stats: { 1: v6Stats, 2: { games: 1, wins: 0, losses: 1, opponentSkill: 4 } },
    })

    it('gives every existing stats entry zero points, scored games and time', () => {
      const migrated = migrateSession(v6() as never, 6)
      expect(migrated?.stats[1]).toEqual({ ...v6Stats, pointsFor: 0, pointsAgainst: 0, scoredGames: 0, secondsPlayed: 0, secondsWaited: 0 })
      expect(migrated?.stats[2]).toEqual({
        games: 1,
        wins: 0,
        losses: 1,
        opponentSkill: 4,
        pointsFor: 0,
        pointsAgainst: 0,
        scoredGames: 0,
        secondsPlayed: 0,
        secondsWaited: 0,
      })
    })

    it('leaves a game already in progress without a start time, and everything else as it was', () => {
      const session = { ...v6(), courts: [{ id: 1, name: 'Court 1', teams: [[1, 2], [3, 4]] as [number[], number[]] }] }
      const migrated = migrateSession(session as never, 6)
      expect(migrated?.courts).toEqual(session.courts)
      expect(migrated?.courts[0]).not.toHaveProperty('startedAt')
      expect(migrated?.matchmaking).toBe(session.matchmaking)
    })

    it('does not touch stats that already have the new fields', () => {
      const current = { ...v6Stats, pointsFor: 30, pointsAgainst: 20, scoredGames: 3, secondsPlayed: 900, secondsWaited: 120 }
      const session = { ...createSession('doubles', 1), stats: { 1: current } }
      expect(migrateSession(session, SESSION_STORE_VERSION)?.stats[1]).toEqual(current)
    })

    it('does not mutate the session it was given', () => {
      const session = v6()
      const snapshot = structuredClone(session)
      migrateSession(session as never, 6)
      expect(session).toEqual(snapshot)
    })

    it('still chains through the earlier upgrades', () => {
      // A v4 session had stats with the first four counters and courts without names.
      const v4 = { ...v6(), courts: [{ id: 1, teams: null }] }
      const migrated = migrateSession(v4 as never, 4)
      expect(migrated?.courts[0].name).toBe('Court 1')
      expect(migrated?.stats[1]).toMatchObject({ games: 3, pointsFor: 0, scoredGames: 0, secondsPlayed: 0, secondsWaited: 0 })
      // Before v4 there were no stats at all.
      const { stats: _s, ...v3 } = createSession('doubles', 1)
      expect(migrateSession(v3 as never, 3)?.stats).toEqual({})
    })
  })

  describe('v7 to v8: time waited', () => {
    const v7Stats = { games: 2, wins: 1, losses: 1, opponentSkill: 6, pointsFor: 0, pointsAgainst: 0, scoredGames: 0, secondsPlayed: 600 }
    const match = (waited?: Record<number, number>) => ({
      courtName: 'Court 1',
      teams: [[1, 2], [3, 4]] as [number[], number[]],
      winner: 0 as const,
      seconds: 300,
      ...(waited ? { waited } : {}),
    })

    it('adds up the waits the finished games recorded', () => {
      const session = {
        ...createSession('doubles', 1),
        stats: { 1: v7Stats, 2: v7Stats, 3: v7Stats, 4: v7Stats },
        matches: [match({ 1: 60, 2: 30 }), match(), match({ 1: 90, 3: 45 })],
      }
      const migrated = migrateSession(session as never, 7)
      expect(migrated?.stats[1]).toEqual({ ...v7Stats, secondsWaited: 150 })
      expect(migrated?.stats[2].secondsWaited).toBe(30)
      expect(migrated?.stats[3].secondsWaited).toBe(45)
      expect(migrated?.stats[4].secondsWaited).toBe(0)
    })

    it('gives zero when no games were kept', () => {
      const { matches: _m, ...session } = { ...createSession('doubles', 1), stats: { 1: v7Stats } }
      expect(migrateSession(session as never, 7)?.stats[1]).toEqual({ ...v7Stats, secondsWaited: 0 })
    })
  })

  it('leaves a current session untouched', () => {
    const session = createSession('singles', 3, { avgGameMinutes: 20 })
    expect(migrateSession(session, SESSION_STORE_VERSION)).toEqual(session)
  })
})
