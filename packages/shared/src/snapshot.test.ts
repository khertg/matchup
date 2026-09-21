import { describe, expect, it } from 'vitest'
import {
  SNAPSHOT_LIMITS,
  SNAPSHOT_VERSION,
  jsonBytes,
  parseFullBackupEnvelope,
  parsePublicSnapshot,
  type PublicSnapshot,
} from './snapshot'

const good = (): PublicSnapshot => ({
  schemaVersion: SNAPSHOT_VERSION,
  location: 'Sunset Courts',
  mode: 'doubles',
  matchmaking: 'skill',
  avgGameMinutes: 12,
  courts: [
    { id: 1, name: 'Court 1', teams: [[1, 2], [3, 4]] },
    { id: 2, name: 'Center Court', teams: null },
  ],
  queue: [5, 6],
  nextUp: [],
  onBreak: [],
  partners: [[5, 6]],
  stats: { 1: { games: 2, wins: 2, losses: 0, opponentSkill: 6 } },
  players: {
    1: { id: 1, name: 'Ann', skill: 3 },
    2: { id: 2, name: 'Bob', skill: 3 },
    3: { id: 3, name: 'Cy', skill: 4 },
    4: { id: 4, name: 'Dee', skill: 4 },
    5: { id: 5, name: 'Eve', skill: 2 },
    6: { id: 6, name: 'Fay', skill: 2 },
  },
})

describe('parsePublicSnapshot', () => {
  it('accepts a well-formed snapshot, also after a JSON round trip', () => {
    expect(parsePublicSnapshot(good())).toEqual(good())
    expect(parsePublicSnapshot(JSON.parse(JSON.stringify(good())))).toEqual(good())
  })

  it('rejects anything that is not an object of the right version', () => {
    for (const value of [null, undefined, 'text', 42, [], {}, { ...good(), schemaVersion: 2 }]) {
      expect(parsePublicSnapshot(value)).toBeNull()
    }
  })

  it('rejects wrong field values', () => {
    const bad: unknown[] = [
      { ...good(), mode: 'triples' },
      { ...good(), matchmaking: 'random' },
      { ...good(), location: 42 },
      { ...good(), avgGameMinutes: 'twelve' },
      { ...good(), avgGameMinutes: Infinity },
      { ...good(), courts: [{ id: 1, teams: [[1], 'x'] }] },
      { ...good(), courts: [{ id: 1, teams: [[1], [2], [3]] }] },
      { ...good(), courts: [{ id: 1.5, teams: null }] },
      { ...good(), queue: ['a'] },
      { ...good(), queue: [-1] },
      { ...good(), partners: [[1]] },
      { ...good(), partners: [[1, 2, 3]] },
      { ...good(), stats: null },
      { ...good(), stats: { 1: { games: -1, wins: 0, losses: 0, opponentSkill: 0 } } },
      { ...good(), stats: { abc: { games: 1, wins: 1, losses: 0, opponentSkill: 1 } } },
      { ...good(), players: { 1: { id: 1, name: 'A', skill: 9 } } },
      { ...good(), players: { 1: { id: 1, name: 'A', skill: 2.5 } } },
      { ...good(), players: { 1: { id: 2, name: 'A', skill: 3 } } }, // key and id disagree
      { ...good(), players: { 1: { id: 1, name: 7, skill: 3 } } },
    ]
    for (const value of bad) expect(parsePublicSnapshot(value), JSON.stringify(value)).toBeNull()
  })

  it('enforces size limits so a client cannot store or broadcast huge data', () => {
    const tooManyCourts = Array.from({ length: SNAPSHOT_LIMITS.courts + 1 }, (_, i) => ({ id: i, teams: null }))
    expect(parsePublicSnapshot({ ...good(), courts: tooManyCourts })).toBeNull()
    expect(parsePublicSnapshot({ ...good(), location: 'x'.repeat(121) })).toBeNull()
    expect(
      parsePublicSnapshot({ ...good(), players: { 1: { id: 1, name: 'n'.repeat(81), skill: 3 } } }),
    ).toBeNull()
    expect(
      parsePublicSnapshot({ ...good(), queue: Array.from({ length: SNAPSHOT_LIMITS.queue + 1 }, (_, i) => i) }),
    ).toBeNull()
  })

  describe('next up', () => {
    it('keeps the group staff would start next', () => {
      const snapshot = { ...good(), nextUp: [1, 2, 3, 4] }
      expect(parsePublicSnapshot(snapshot)!.nextUp).toEqual([1, 2, 3, 4])
    })

    it('accepts a board from before "next up" existed and reads it as empty', () => {
      const { nextUp: _omit, ...legacy } = good()
      expect(parsePublicSnapshot(legacy)!.nextUp).toEqual([])
    })

    it('rejects a list that is not ids, or is too long', () => {
      for (const nextUp of ['1,2', [1, 'a'], [-1], [1.5], [1, 2, 3, 4, 5], 7, null]) {
        expect(parsePublicSnapshot({ ...good(), nextUp }), JSON.stringify(nextUp)).toBeNull()
      }
    })

    it('returns a copy of the list', () => {
      const input = { ...good(), nextUp: [1, 2] }
      const parsed = parsePublicSnapshot(input)!
      input.nextUp.push(3)
      expect(parsed.nextUp).toEqual([1, 2])
    })
  })

  describe('court names', () => {
    it('keeps the names people gave their courts', () => {
      expect(parsePublicSnapshot(good())!.courts.map((c) => c.name)).toEqual(['Court 1', 'Center Court'])
    })

    it('accepts courts from before names existed and names them "Court <id>"', () => {
      const legacy = { ...good(), courts: [{ id: 1, teams: null }, { id: 7, teams: null }] }
      expect(parsePublicSnapshot(legacy)!.courts.map((c) => c.name)).toEqual(['Court 1', 'Court 7'])
    })

    it('treats a blank name as missing', () => {
      const blank = { ...good(), courts: [{ id: 3, name: '   ', teams: null }] }
      expect(parsePublicSnapshot(blank)!.courts[0].name).toBe('Court 3')
    })

    it('rejects a name that is not text or is too long', () => {
      for (const name of [42, null, {}, ['x'], 'n'.repeat(41)]) {
        const bad = { ...good(), courts: [{ id: 1, name, teams: null }] }
        expect(parsePublicSnapshot(bad), JSON.stringify(name)).toBeNull()
      }
      const longest = { ...good(), courts: [{ id: 1, name: 'n'.repeat(40), teams: null }] }
      expect(parsePublicSnapshot(longest)).not.toBeNull()
    })

    it('drops unknown court fields but keeps the name', () => {
      const dirty = { ...good(), courts: [{ id: 1, name: 'Court 1', teams: null, secret: 'x', notes: 'y' }] }
      expect(JSON.stringify(parsePublicSnapshot(dirty)!.courts)).toBe('[{"id":1,"name":"Court 1","teams":null}]')
    })
  })

  it('drops unknown fields, so private data can never slip through', () => {
    const snapshot = good()
    const sneaky = {
      ...snapshot,
      lastResult: { 1: 'W' },
      players: Object.fromEntries(
        Object.entries(snapshot.players).map(([id, p]) => [id, { ...p, gender: 'F', email: 'a@b.c' }]),
      ),
      stats: { 1: { games: 2, wins: 2, losses: 0, opponentSkill: 6, secret: 'x' } },
    }
    const parsed = parsePublicSnapshot(sneaky)
    expect(parsed).toEqual(snapshot)
    expect(JSON.stringify(parsed)).not.toMatch(/gender|email|lastResult|secret/)
  })

  it('returns a copy, not the object it was given', () => {
    const input = good()
    const parsed = parsePublicSnapshot(input)!
    expect(parsed).not.toBe(input)
    expect(parsed.courts[0]).not.toBe(input.courts[0])
    input.queue.push(99)
    expect(parsed.queue).toEqual([5, 6])
  })
})

describe('parseFullBackupEnvelope', () => {
  const envelope = () => ({ schemaVersion: 1, storeVersion: 4, location: 'Club', session: { any: 'thing' } })

  it('accepts the outer shape without judging the session inside', () => {
    expect(parseFullBackupEnvelope(envelope())).toEqual(envelope())
  })

  it('rejects a bad envelope', () => {
    for (const value of [
      null,
      {},
      { ...envelope(), schemaVersion: 9 },
      { ...envelope(), storeVersion: 0 },
      { ...envelope(), storeVersion: 'x' },
      { ...envelope(), location: 5 },
      { ...envelope(), session: 'no' },
      { ...envelope(), session: [] },
    ]) {
      expect(parseFullBackupEnvelope(value)).toBeNull()
    }
  })
})

describe('jsonBytes', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(jsonBytes('abc')).toBe(5)
    expect(jsonBytes('é')).toBe(4)
  })
})
