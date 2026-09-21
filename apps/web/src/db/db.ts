import Dexie, { type EntityTable } from 'dexie'
import type { HistoryRecord } from './history'

export type SkillLevel = 1 | 2 | 3 | 4 | 5 | 6

export type Gender = 'M' | 'F'

export interface Player {
  id?: number
  name: string
  skill: SkillLevel
  gender?: Gender
  /** All-time totals across saved sessions. */
  games?: number
  wins?: number
  losses?: number
}

export interface Session {
  id?: number
  location: string
  courts: number
  mode: 'doubles' | 'singles'
  createdAt: number
}

export const db = new Dexie('matchup') as Dexie & {
  players: EntityTable<Player, 'id'>
  sessions: EntityTable<Session, 'id'>
  /** Ended sessions, kept so they can be viewed and resumed. */
  history: EntityTable<HistoryRecord, 'id'>
}

db.version(1).stores({
  players: '++id, name',
  sessions: '++id, createdAt',
})

// Version 2 adds the history of ended sessions. The old sessions table is unused and left as it was.
db.version(2).stores({
  players: '++id, name',
  sessions: '++id, createdAt',
  history: 'id, endedAt',
})
