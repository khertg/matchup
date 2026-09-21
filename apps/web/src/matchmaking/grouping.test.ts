import { describe, expect, it } from 'vitest'
import { checkIn, createSession, lockPartners } from '@/rotation/engine'
import { fillCourts } from '@/rotation/testing'
import type { MatchmakingMode, RosterPlayer, SessionState } from '@/rotation/types'
import { LOOKAHEAD_UNITS, selectGroup, splitGroup } from './grouping'

type Spec = [skill: RosterPlayer['skill'], gender?: 'M' | 'F']

/** Session with players 1..n checked in (queued, no court assigned), in order. */
function queued(matchmaking: MatchmakingMode, specs: Spec[]): SessionState {
  let s = createSession('doubles', 1, { matchmaking })
  specs.forEach(([skill, gender], i) => {
    s = checkIn(s, { id: i + 1, name: `P${i + 1}`, skill, gender })
  })
  return s
}

const group = (s: SessionState) => selectGroup(s, s.queue)
const sorted = (ids: number[] | null) => ids?.slice().sort((a, b) => a - b)
const side = (ids: number[]) => ids.slice().sort((a, b) => a - b).join(',')
const teamKeys = (teams: number[][]) => teams.map(side).sort()

describe('splitGroup', () => {
  it('balances teams by total skill', () => {
    const s = queued('balanced', [[6], [5], [2], [1]])
    expect(teamKeys(splitGroup(s, [1, 2, 3, 4]))).toEqual(['1,4', '2,3'])
  })

  it('keeps a locked pair together even when that is unbalanced', () => {
    const s = lockPartners(queued('balanced', [[6], [5], [2], [1]]), 1, 2)
    expect(teamKeys(splitGroup(s, [1, 2, 3, 4]))).toEqual(['1,2', '3,4'])
  })

  it('puts two locked pairs against each other', () => {
    let s = queued('balanced', [[6], [5], [2], [1]])
    s = lockPartners(lockPartners(s, 1, 4), 2, 3)
    expect(teamKeys(splitGroup(s, [1, 2, 3, 4]))).toEqual(['1,4', '2,3'])
  })

  it('gives each team one man and one woman in mixed doubles, then balances skill', () => {
    // Men 1 (Lv6) and 2 (Lv5); women 3 (Lv2) and 4 (Lv1).
    const s = queued('mixed', [[6, 'M'], [5, 'M'], [2, 'F'], [1, 'F']])
    // 1+4 vs 2+3 (7 vs 7) beats 1+3 vs 2+4 (8 vs 6).
    expect(teamKeys(splitGroup(s, [1, 2, 3, 4]))).toEqual(['1,4', '2,3'])
  })
})

describe('selectGroup: auto-balanced', () => {
  it('takes the first four in the queue', () => {
    const s = queued('balanced', [[3], [3], [3], [3], [3], [3]])
    expect(group(s)).toEqual([1, 2, 3, 4])
  })

  it('returns null until four players can be seated', () => {
    expect(group(queued('balanced', [[3], [3], [3]]))).toBeNull()
  })

  it('pulls a locked partner forward to sit with their partner', () => {
    // 3 and 5 are locked: they enter together, leaving 4 waiting.
    const s = lockPartners(queued('balanced', [[3], [3], [3], [3], [3]]), 3, 5)
    expect(sorted(group(s))).toEqual([1, 2, 3, 5])
  })

  it('keeps a locked pair as the anchor when they are first in line', () => {
    const s = lockPartners(queued('balanced', [[3], [3], [3], [3], [3]]), 1, 2)
    expect(sorted(group(s))).toEqual([1, 2, 3, 4])
  })

  it('skips an anchor that cannot be completed without splitting a pair', () => {
    // Queue: solo 1, pair (2,3), pair (4,5). Player 1 needs three more, which the pairs cannot supply.
    let s = queued('balanced', [[3], [3], [3], [3], [3]])
    s = lockPartners(lockPartners(s, 2, 3), 4, 5)
    expect(sorted(group(s))).toEqual([2, 3, 4, 5])
  })

  it('treats a pair as two solos while only one partner is waiting', () => {
    let s = queued('balanced', [[3], [3], [3], [3], [3]])
    s = lockPartners(s, 1, 5)
    // Partner 5 is on a break, so player 1 is just a solo again.
    s = { ...s, queue: [1, 2, 3, 4], onBreak: [5] }
    expect(group(s)).toEqual([1, 2, 3, 4])
  })
})

describe('selectGroup: skill-separated', () => {
  it('groups the anchor with the closest skill levels behind them', () => {
    const s = queued('skill', [[1], [6], [1], [6], [1], [6], [1]])
    expect(sorted(group(s))).toEqual([1, 3, 5, 7])
  })

  it('only looks a limited distance behind the anchor', () => {
    // Every player in the window is Lv6 except the anchor; the other Lv1 is far beyond the look-ahead.
    const specs: Spec[] = [[1], ...Array.from({ length: LOOKAHEAD_UNITS + 2 }, () => [6] as Spec), [1]]
    const s = queued('skill', specs)
    expect(group(s)).toEqual([1, 2, 3, 4])
  })
})

describe('selectGroup: winners vs. losers', () => {
  it('seats winners with winners and losers with losers', () => {
    const s = {
      ...queued('winners', Array.from({ length: 8 }, () => [3] as Spec)),
      lastResult: { 1: 'W', 2: 'W', 3: 'L', 4: 'L', 5: 'W', 6: 'W', 7: 'L', 8: 'L' },
    } as SessionState
    expect(sorted(group(s))).toEqual([1, 2, 5, 6])
  })

  it('treats players with no result yet as neutral', () => {
    const s = {
      ...queued('winners', Array.from({ length: 5 }, () => [3] as Spec)),
      lastResult: { 1: 'W', 2: 'L', 3: 'W' },
    } as SessionState
    // Anchor 1 (W): {1,3,4,5} has no W/L mix, {1,2,...} would.
    expect(sorted(group(s))).toEqual([1, 3, 4, 5])
  })
})

describe('selectGroup: mixed doubles', () => {
  it('finds two men and two women, skipping an extra man', () => {
    const s = queued('mixed', [[3, 'M'], [3, 'M'], [3, 'M'], [3, 'F'], [3, 'F']])
    expect(sorted(group(s))).toEqual([1, 2, 4, 5])
  })

  it('never stages a non-mixed group on its own', () => {
    const s = queued('mixed', [[3, 'M'], [3, 'M'], [3, 'M'], [3, 'M']])
    expect(group(s)).toBeNull()
  })

  it('can still be started by hand, ignoring the mode', () => {
    const s = queued('mixed', [[3, 'M'], [3, 'M'], [3, 'M'], [3, 'M']])
    expect(selectGroup(s, s.queue, { ignoreMode: true })).toEqual([1, 2, 3, 4])
  })

  it('rejects a same-gender locked pair as a mixed group', () => {
    let s = queued('mixed', [[3, 'M'], [3, 'M'], [3, 'F'], [3, 'F']])
    s = lockPartners(s, 1, 2)
    expect(group(s)).toBeNull()
    // Started by hand, the pair still shares a team.
    const chosen = selectGroup(s, s.queue, { ignoreMode: true })!
    expect(teamKeys(splitGroup(s, chosen))).toEqual(['1,2', '3,4'])
  })

  it('searches beyond the usual look-ahead for a valid mixed group', () => {
    // Eight men wait ahead of the only two women, but a mixed game is still possible.
    const specs: Spec[] = [...Array.from({ length: 8 }, () => [3, 'M'] as Spec), [3, 'F'], [3, 'F']]
    const s = queued('mixed', specs)
    expect(sorted(group(s))).toEqual([1, 2, 9, 10])
  })

  it('accepts a locked mixed couple', () => {
    let s = queued('mixed', [[3, 'M'], [3, 'F'], [3, 'M'], [3, 'F']])
    s = lockPartners(s, 1, 2)
    const teams = splitGroup(s, group(s)!)
    expect(teamKeys(teams)).toEqual(['1,2', '3,4'])
  })
})

describe('starting games with modes', () => {
  it('fills two courts with different groups in one pass', () => {
    let s = createSession('doubles', 2, { matchmaking: 'skill' })
    ;([[1], [1], [6], [6], [1], [1], [6], [6]] as Spec[]).forEach(([skill], i) => {
      s = checkIn(s, { id: i + 1, name: `P${i + 1}`, skill })
    })
    s = fillCourts(s)
    const courts = s.courts.map((c) => side(c.teams!.flat()))
    expect(courts).toEqual(['1,2,5,6', '3,4,7,8'])
    expect(s.queue).toEqual([])
  })

  it('leaves a court empty rather than splitting a locked pair', () => {
    let s = createSession('doubles', 1)
    for (let id = 1; id <= 3; id++) s = checkIn(s, { id, name: `P${id}`, skill: 3 })
    s = lockPartners(s, 1, 2)
    s = fillCourts(s)
    // Only three players wait, so nothing can be staged yet.
    expect(s.courts[0].teams).toBeNull()
  })
})
