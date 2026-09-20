import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  assignCourts,
  cancelMatch as cancelMatchEngine,
  checkIn,
  checkOut,
  createSession,
  lockPartners as lockPartnersEngine,
  playingIds,
  recordResult as recordResultEngine,
  replacePlayer as replacePlayerEngine,
  setAvgGameMinutes as setAvgGameMinutesEngine,
  type SessionOptions,
  startCourtManually as startCourtManuallyEngine,
  unlockPartners as unlockPartnersEngine,
} from '@/rotation/engine'
import type { GameMode, RosterPlayer, SessionState } from '@/rotation/types'
import { migrateSession, SESSION_STORE_VERSION } from './migrate'

interface SessionStore {
  location: string
  session: SessionState | null
  /** Snapshot from before the last recorded result; cleared by any other change. */
  previous: SessionState | null

  startSession: (
    location: string,
    mode: GameMode,
    courtCount: number,
    options?: SessionOptions,
  ) => void
  setAvgGameMinutes: (minutes: number) => void
  /** Returns false if the player was already queued or playing. */
  checkInPlayer: (player: RosterPlayer) => boolean
  checkOutPlayer: (playerId: number) => void
  recordResult: (courtId: number, winner: 0 | 1) => void
  /** Restores the state from before the last result. Returns false if it is no longer safe. */
  undo: () => boolean
  cancelMatch: (courtId: number) => void
  /** Stage a game on an open court from the waiting players, whatever the matchmaking mode. */
  startCourt: (courtId: number) => void
  /** Swap a playing player for a waiting one (defaults to the front of the queue). */
  replacePlayer: (courtId: number, outId: number, inId?: number) => void
  /** Lock two checked-in players as doubles partners. */
  lockPartners: (a: number, b: number) => void
  unlockPartners: (playerId: number) => void
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

      startSession: (location, mode, courtCount, options) =>
        set({
          location,
          session: createSession(mode, courtCount, options),
          previous: null,
        }),

      setAvgGameMinutes: (minutes) => {
        const session = requireSession(get().session)
        const { previous } = get()
        // A setting, not a game event: keep the pending result undo, but carry the
        // new value into its snapshot so undoing a result never reverts the setting.
        set({
          session: setAvgGameMinutesEngine(session, minutes),
          previous: previous && setAvgGameMinutesEngine(previous, minutes),
        })
      },

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

      startCourt: (courtId) => {
        const session = requireSession(get().session)
        set({ session: startCourtManuallyEngine(session, courtId), previous: null })
      },

      replacePlayer: (courtId, outId, inId) => {
        const session = requireSession(get().session)
        set({ session: replacePlayerEngine(session, courtId, outId, inId), previous: null })
      },

      lockPartners: (a, b) => {
        const session = requireSession(get().session)
        // Locking only changes future grouping, so re-check whether a court can now fill.
        set({ session: assignCourts(lockPartnersEngine(session, a, b)), previous: null })
      },

      unlockPartners: (playerId) => {
        const session = requireSession(get().session)
        set({ session: unlockPartnersEngine(session, playerId), previous: null })
      },

      endSession: () => set({ location: '', session: null, previous: null }),
    }),
    {
      name: 'matchup-session',
      version: SESSION_STORE_VERSION,
      migrate: (persisted, version) => {
        const saved = persisted as { location: string; session: SessionState | null }
        return { ...saved, session: migrateSession(saved.session, version) }
      },
      storage: createJSONStorage(() => localStorage),
      // The undo snapshot only makes sense for a few seconds, so never persist it.
      partialize: ({ location, session }) => ({ location, session }),
    },
  ),
)

/** Number of players currently checked in and not on a break (queued or playing). */
export const activePlayerCount = (session: SessionState) =>
  session.queue.length + playingIds(session).length
