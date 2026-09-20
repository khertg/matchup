import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  assignCourts,
  cancelMatch as cancelMatchEngine,
  checkIn,
  checkOut,
  createSession,
  playingIds,
  recordResult as recordResultEngine,
  replacePlayer as replacePlayerEngine,
} from '@/rotation/engine'
import type { GameMode, RosterPlayer, SessionState } from '@/rotation/types'

interface SessionStore {
  location: string
  session: SessionState | null
  /** Snapshot from before the last recorded result; cleared by any other change. */
  previous: SessionState | null

  startSession: (location: string, mode: GameMode, courtCount: number) => void
  /** Returns false if the player was already queued or playing. */
  checkInPlayer: (player: RosterPlayer) => boolean
  checkOutPlayer: (playerId: number) => void
  recordResult: (courtId: number, winner: 0 | 1) => void
  /** Restores the state from before the last result. Returns false if it is no longer safe. */
  undo: () => boolean
  cancelMatch: (courtId: number) => void
  replacePlayer: (courtId: number, outId: number) => void
  endSession: () => void
}

const requireSession = (session: SessionState | null) => {
  if (!session) throw new Error('No session in progress')
  return session
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      location: '',
      session: null,
      previous: null,

      startSession: (location, mode, courtCount) =>
        set({ location, session: createSession(mode, courtCount), previous: null }),

      checkInPlayer: (player) => {
        const session = requireSession(get().session)
        const next = checkIn(session, player)
        if (next === session) return false
        set({ session: assignCourts(next), previous: null })
        return true
      },

      checkOutPlayer: (playerId) => {
        const session = requireSession(get().session)
        set({ session: checkOut(session, playerId), previous: null })
      },

      recordResult: (courtId, winner) => {
        const session = requireSession(get().session)
        const { state } = recordResultEngine(session, courtId, winner)
        set({ session: assignCourts(state), previous: session })
      },

      undo: () => {
        const { previous } = get()
        if (!previous) return false
        set({ session: previous, previous: null })
        return true
      },

      cancelMatch: (courtId) => {
        const session = requireSession(get().session)
        set({ session: cancelMatchEngine(session, courtId), previous: null })
      },

      replacePlayer: (courtId, outId) => {
        const session = requireSession(get().session)
        set({ session: replacePlayerEngine(session, courtId, outId), previous: null })
      },

      endSession: () => set({ location: '', session: null, previous: null }),
    }),
    {
      name: 'matchup-session',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // The undo snapshot only makes sense for a few seconds, so never persist it.
      partialize: ({ location, session }) => ({ location, session }),
    },
  ),
)

/** Number of players currently checked in and not on a break (queued or playing). */
export const activePlayerCount = (session: SessionState) =>
  session.queue.length + playingIds(session).length
