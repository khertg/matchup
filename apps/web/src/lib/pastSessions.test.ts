import type { DeletedHistorySummary, HistorySummary as ClubSummary } from '@q2dink/shared'
import { describe, expect, it } from 'vitest'
import type { HistorySummary as LocalSummary } from '@/db/history'
import { daysLeft, mergeHistory } from './pastSessions'

const DAY = 24 * 60 * 60 * 1000
const local = (id: string, endedAt: number, over: Partial<LocalSummary> = {}): LocalSummary => ({
  id,
  location: `Night ${id}`,
  startedAt: endedAt - 1000,
  endedAt,
  mode: 'doubles',
  matchmaking: 'balanced',
  players: 4,
  games: 1,
  synced: true,
  ...over,
})
const club = (id: string, endedAt: number): ClubSummary => ({
  id,
  location: `Night ${id}`,
  endedAt: new Date(endedAt).toISOString(),
  mode: 'doubles',
  players: 4,
  games: 1,
})
const clubDeleted = (id: string, endedAt: number, deletedAt: number): DeletedHistorySummary => ({
  ...club(id, endedAt),
  deletedAt: new Date(deletedAt).toISOString(),
})
const ids = (entries: { id: string }[]) => entries.map((e) => e.id)

describe('mergeHistory', () => {
  it('lists each session once, newest first, from this device and the club', () => {
    const merged = mergeHistory([local('a', 3000), local('b', 1000)], [], [club('b', 1000), club('c', 2000)], [])
    expect(ids(merged.active)).toEqual(['a', 'c', 'b'])
    expect(merged.active.map((e) => e.clubOnly)).toEqual([false, true, false])
    expect(merged.deleted).toEqual([])
  })

  it('puts a session deleted here in Recently deleted, even before the club is told', () => {
    const merged = mergeHistory(
      [local('a', 2000)],
      [local('b', 1000, { deletedAt: 5000, deletionPending: 'delete' })],
      [club('b', 1000)],
      [],
    )
    expect(ids(merged.active)).toEqual(['a'])
    expect(merged.deleted).toMatchObject([{ id: 'b', deletedAt: 5000 }])
  })

  it('follows the club when another device deleted a session this device still lists', () => {
    const merged = mergeHistory([local('a', 2000)], [], [], [clubDeleted('a', 2000, 9000)])
    expect(merged.active).toEqual([])
    expect(merged.deleted).toMatchObject([{ id: 'a', deletedAt: 9000, clubOnly: false }])
    expect(merged.deletedElsewhere).toEqual([{ id: 'a', deletedAt: 9000 }])
  })

  it('keeps a session restored here in the list until the club has been told', () => {
    const merged = mergeHistory([local('a', 2000, { deletionPending: 'restore' })], [], [], [clubDeleted('a', 2000, 9000)])
    expect(ids(merged.active)).toEqual(['a'])
    expect(merged.deleted).toEqual([])
    expect(merged.deletedElsewhere).toEqual([])
  })

  it('brings back a session another device restored', () => {
    const merged = mergeHistory([], [local('a', 2000, { deletedAt: 9000 })], [club('a', 2000)], [])
    expect(ids(merged.active)).toEqual(['a'])
    expect(merged.restoredElsewhere).toEqual(['a'])
  })

  it('hides a session removed for good here, and lists the club’s deleted ones this device never had', () => {
    const merged = mergeHistory(
      [],
      [local('a', 1000, { deletedAt: 5000, deletionPending: 'purge' })],
      [],
      [clubDeleted('a', 1000, 5000), clubDeleted('c', 3000, 8000), clubDeleted('d', 2000, 9000)],
    )
    expect(ids(merged.active)).toEqual([])
    expect(ids(merged.deleted)).toEqual(['d', 'c']) // most recently deleted first
    expect(merged.deleted.every((e) => e.clubOnly)).toBe(true)
  })
})

describe('daysLeft', () => {
  it('counts whole days until a deleted session goes for good, never below zero', () => {
    expect(daysLeft(0, 30, 0)).toBe(30)
    expect(daysLeft(0, 30, 29.5 * DAY)).toBe(1)
    expect(daysLeft(0, 30, 31 * DAY)).toBe(0)
  })
})
