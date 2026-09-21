import Dexie, { type EntityTable } from 'dexie'
import type { PlayerAvatar } from '@/lib/avatar'
import type { HistoryRecord } from './history'

export type SkillLevel = 1 | 2 | 3 | 4 | 5 | 6

export type Gender = 'M' | 'F'

export interface Player {
  id?: number
  name: string
  skill: SkillLevel
  gender?: Gender
  /**
   * How this player appears. Kept on the roster only, never in a session, so photos stay out of
   * saved sessions and the live board. Missing means automatic initials.
   */
  avatar?: PlayerAvatar
  /** The club's cloud copy is out of date (changed or removed here, not yet sent). */
  avatarDirty?: boolean
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

/** Small device settings: the club logo and whether player photos are shared on the live page. */
export interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('matchup') as Dexie & {
  players: EntityTable<Player, 'id'>
  sessions: EntityTable<Session, 'id'>
  /** Ended sessions, kept so they can be viewed and resumed. */
  history: EntityTable<HistoryRecord, 'id'>
  settings: EntityTable<Setting, 'key'>
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

// Version 3 adds device settings (the club logo, photo sharing). Player avatars are plain extra fields.
db.version(3).stores({
  players: '++id, name',
  sessions: '++id, createdAt',
  history: 'id, endedAt',
  settings: 'key',
})
