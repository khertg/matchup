import { describe, expect, it } from 'vitest'
import { createSession } from '@/rotation/engine'
import type { SessionState } from '@/rotation/types'
import { applyAction, rebase, sessionIdFor, type PendingAction, type SessionAction } from './actions'

const checkIn = (...names: string[]): SessionAction => ({
  type: 'checkIn',
  players: names.map((name) => ({ name, skill: 3 })),
  now: 0,
})
const apply = (session: SessionState, ...actions: SessionAction[]) =>
  actions.reduce((s, action) => applyAction(s, action).session, session)
const names = (s: SessionState) => s.queue.map((id) => s.players[id].name)

describe('session player ids', () => {
  it('are the session’s own: the next number, or the same player’s id for the same name', () => {
    const s = apply(createSession('doubles', 1), checkIn('Ann', 'Bob'))
    expect(Object.keys(s.players)).toEqual(['1', '2'])
    expect(sessionIdFor(s, ' ann ')).toBe(1)
    expect(sessionIdFor(s, 'Cy')).toBe(3)
    expect(sessionIdFor(createSession('doubles', 1), 'Ann')).toBe(1)
  })

  it('bring a player back from a break under the id they had', () => {
    const s = apply(createSession('doubles', 1), checkIn('Ann'), { type: 'checkOut', playerId: 1 }, checkIn('ANN'))
    expect(s.queue).toEqual([1])
    expect(Object.keys(s.players)).toEqual(['1'])
  })
})

describe('rebase', () => {
  const base = apply(createSession('doubles', 1), checkIn('Ann'))

  it('applies this device’s changes again on the club’s newer copy', () => {
    const club = apply(base, checkIn('Bob'))
    const pending: PendingAction[] = [{ action: checkIn('Cy'), ids: [2] }]
    const result = rebase(club, pending)
    expect(names(result.session)).toEqual(['Ann', 'Bob', 'Cy'])
    expect(result.pending[0].ids).toEqual([3])
    expect(result.dropped).toEqual([])
  })

  it('renumbers later changes that name a player whose id changed on the club’s copy', () => {
    // Here Cy became 2 and was sent on a break; on the club, Bob already took 2.
    const club = apply(base, checkIn('Bob'))
    const pending: PendingAction[] = [
      { action: checkIn('Cy'), ids: [2] },
      { action: { type: 'checkOut', playerId: 2 } },
    ]
    const result = rebase(club, pending)
    expect(names(result.session)).toEqual(['Ann', 'Bob'])
    expect(result.session.onBreak).toEqual([3])
    expect(result.session.players[3].name).toBe('Cy')
  })

  it('drops a change that no longer applies, and says why', () => {
    const playing = apply(base, checkIn('Bob', 'Cy', 'Dee'), { type: 'startGame', courtId: 1, now: 0 })
    const club = apply(playing, { type: 'recordScore', courtId: 1, scoreA: 11, scoreB: 2, now: 0 })
    const result = rebase(club, [{ action: { type: 'recordScore', courtId: 1, scoreA: 3, scoreB: 11, now: 0 } }])
    expect(result.session).toBe(club)
    expect(result.pending).toEqual([])
    expect(result.dropped[0].reason).toMatch(/no game in progress/)
  })

  it('drops an undo once the club’s copy changed since, and applies it when it did not', () => {
    const after = apply(base, checkIn('Bob'))
    const undo: SessionAction = { type: 'restore', before: base, after }
    expect(rebase(after, [{ action: undo }]).session).toBe(base)
    const moved = apply(after, checkIn('Cy'))
    const result = rebase(moved, [{ action: undo }])
    expect(result.session).toBe(moved)
    expect(result.dropped).toHaveLength(1)
  })
})
