import { describe, expect, it } from 'vitest'
import { checkIn, createSession, recordResult } from './engine'
import { lifetimeDelta, lifetimeTotals } from './lifetime'
import { fillCourts } from './testing'
import type { SessionState } from './types'

function played(games: number): SessionState {
  let s = createSession('doubles', 1)
  for (let id = 1; id <= 4; id++) s = checkIn(s, { id, name: `P${id}`, skill: 3 })
  for (let g = 0; g < games; g++) s = recordResult(fillCourts(s), 1, 0).state
  return s
}

describe('lifetimeTotals', () => {
  it('lists players who finished a game, and nobody else', () => {
    expect(lifetimeTotals(played(0))).toEqual({})
    const totals = lifetimeTotals(played(2))
    expect(Object.keys(totals)).toHaveLength(4)
    for (const t of Object.values(totals)) expect(t.games).toBe(2)
  })
})

describe('lifetimeDelta', () => {
  it('is everything when nothing was counted before', () => {
    const s = played(2)
    expect(lifetimeDelta(s, {})).toEqual(lifetimeTotals(s))
  })

  it('is only the games played since an earlier save', () => {
    const before = played(2)
    const after = played(5)
    const delta = lifetimeDelta(after, lifetimeTotals(before))
    for (const d of Object.values(delta)) expect(d.games).toBe(3)
    // Wins and losses are differences too, and always add up.
    for (const d of Object.values(delta)) expect(d.wins + d.losses).toBe(d.games)
  })

  it('is empty when nothing changed, so saving twice adds nothing', () => {
    const s = played(3)
    expect(lifetimeDelta(s, lifetimeTotals(s))).toEqual({})
  })

  it('never goes negative, and ignores players who are no longer in the session', () => {
    const s = played(1)
    const counted = { 1: { games: 9, wins: 9, losses: 9 }, 77: { games: 3, wins: 1, losses: 2 } }
    const delta = lifetimeDelta(s, counted)
    expect(delta[1]).toBeUndefined()
    expect(delta[77]).toBeUndefined()
    expect(Object.keys(delta)).toHaveLength(3)
  })

  it('does not change what it is given', () => {
    const s = played(2)
    const counted = lifetimeTotals(played(1))
    const snapshot = structuredClone({ s, counted })
    lifetimeDelta(s, counted)
    expect({ s, counted }).toEqual(snapshot)
  })
})
