import { describe, expect, it } from 'vitest'
import { checkIn, checkOut, createSession, nextGroups, setCourtLevels, type Lane } from '@/rotation/engine'
import { fillCourts } from '@/rotation/testing'
import type { SessionState } from '@/rotation/types'
import { playerStatuses } from './playerStatus'

function withPlayers(state: SessionState, skills: number[]): SessionState {
  return skills.reduce(
    (s, skill, i) => checkIn(s, { id: i + 1, name: 'P' + (i + 1), skill: skill as 1, gender: 'M' }),
    state,
  )
}

const labels = (s: SessionState, lanes: Lane[] = nextGroups(s)) =>
  Object.fromEntries(playerStatuses(s, lanes).map((st) => [st.id, st.label]))

describe('playerStatuses', () => {
  it('says where everyone is: next up, waiting with their place, on which court, or on a break', () => {
    let s = fillCourts(withPlayers(createSession('doubles', 1), [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]))
    s = checkOut(s, 10)
    const statuses = playerStatuses(s, nextGroups(s))
    expect(statuses.map((st) => st.place)).toEqual([
      ...Array(4).fill('nextUp'),
      'waiting',
      ...Array(4).fill('court'),
      'break',
    ])
    const byId = labels(s)
    expect(byId[1]).toBe('On Court 1')
    expect(byId[9]).toBe('Waiting #5')
    expect(byId[10]).toBe('On a break')
    expect(new Set([5, 6, 7, 8].map((id) => byId[id]))).toEqual(new Set(['Next up']))
    expect(statuses.find((st) => st.id === 5)?.queuePlace).toBe(1)
  })

  it('names the level of each next group while courts are kept for levels', () => {
    let s = withPlayers(createSession('doubles', 2), [5, 5, 5, 5, 2, 2, 2, 2])
    s = setCourtLevels(s, 1, [4, 6])
    const byId = labels(s)
    expect(byId[1]).toMatch(/^Next up · /)
    expect(byId[5]).toBe('Next up · Any level')
    const statuses = playerStatuses(s, nextGroups(s))
    expect(statuses.find((st) => st.id === 1)?.lane).toBe(0)
    expect(statuses.find((st) => st.id === 5)?.lane).toBe(1)
  })
})
