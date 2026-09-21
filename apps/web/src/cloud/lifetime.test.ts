import { describe, expect, it } from 'vitest'
import { checkIn, createSession, recordResult } from '@/rotation/engine'
import { fillCourts } from '@/rotation/testing'
import { newBatchId } from './id'
import { toLifetimePlayers } from './lifetime'

describe('toLifetimePlayers', () => {
  it('lists each player who finished a game with their totals', () => {
    let s = createSession('singles', 1)
    s = checkIn(s, { id: 1, name: 'Ann', skill: 3 })
    s = checkIn(s, { id: 2, name: 'Bob', skill: 3 })
    s = checkIn(s, { id: 3, name: 'Cy', skill: 3 })
    s = recordResult(fillCourts(s), 1, 0).state

    const players = toLifetimePlayers(s)
    expect(players.map((p) => p.name).sort()).toEqual(['Ann', 'Bob'])
    expect(players.reduce((sum, p) => sum + p.wins, 0)).toBe(1)
    expect(players.reduce((sum, p) => sum + p.losses, 0)).toBe(1)
    expect(players.every((p) => p.games === 1)).toBe(true)
  })

  it('is empty when nobody has played', () => {
    expect(toLifetimePlayers(createSession('doubles', 1))).toEqual([])
  })
})

describe('newBatchId', () => {
  it('produces distinct, well-formed version 4 UUIDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newBatchId()))
    expect(ids.size).toBe(50)
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }
  })
})
