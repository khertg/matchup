import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  addCourt as addCourtEngine,
  cancelMatch as cancelMatchEngine,
  checkIn,
  checkOut,
  closeCourt as closeCourtEngine,
  createSession,
  lockPartners as lockPartnersEngine,
  moveCourt as moveCourtEngine,
  playingIds,
  recordResult as recordResultEngine,
  renameCourt as renameCourtEngine,
  replacePlayer as replacePlayerEngine,
  setAvgGameMinutes as setAvgGameMinutesEngine,
  type NextGroupOptions,
  type SessionOptions,
  startGame as startGameEngine,
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
  /** Check several players in at once, in the order given. Returns how many were newly checked in. */
  checkInPlayers: (players: RosterPlayer[]) => number
  checkOutPlayer: (playerId: number) => void
  recordResult: (courtId: number, winner: 0 | 1) => void
  /** Restores the state from before the last result. Returns false if it is no longer safe. */
  undo: () => boolean
  cancelMatch: (courtId: number) => void
  /**
   * Put the next group on an open court. Games never start by themselves; this is the only
   * way one begins. `ignoreMode` is the mixed-doubles override (start with whoever is waiting).
   */
  startGame: (courtId: number, options?: NextGroupOptions) => void
  /** Open another court (named with the lowest free number unless given). It starts open. */
  addCourt: (name?: string) => void
  /** Rename a court. Throws a RangeError with a readable message if the name is empty, too long or taken. */
  renameCourt: (courtId: number, name: string) => void
  /** Move a court one place up (-1) or down (1) on the board. */
  moveCourt: (courtId: number, offset: -1 | 1) => void
  /** Close a court. A game in progress is cancelled and its players return to the front of the queue. */
  closeCourt: (courtId: number) => void
  /** Swap a playing player for a waiting one (defaults to the front of the queue). */
  replacePlayer: (courtId: number, outId: number, inId?: number) => void
  /** Lock two checked-in players as doubles partners. */
  lockPartners: (a: number, b: number) => void
  unlockPartners: (playerId: number) => void
  /** Replace the running session, for example one resumed from the cloud on another device. */
  loadSession: (location: string, session: SessionState) => void
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
        set({ session: next, previous: null })
        return true
      },

      checkInPlayers: (players) => {
        const session = requireSession(get().session)
        let next = session
        let added = 0
        for (const player of players) {
          const after = checkIn(next, player)
          if (after !== next) added++
          next = after
        }
        if (added > 0) set({ session: next, previous: null })
        return added
      },

      checkOutPlayer: (playerId) => {
        const session = requireSession(get().session)
        set({ session: checkOut(session, playerId), previous: null })
      },

      recordResult: (courtId, winner) => {
        const session = requireSession(get().session)
        const { state } = recordResultEngine(session, courtId, winner)
        set({ session: state, previous: session })
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

      startGame: (courtId, options) => {
        const session = requireSession(get().session)
        set({ session: startGameEngine(session, courtId, options), previous: null })
      },

      // Court changes clear the result undo: undoing a result would otherwise put players back
      // on a court that has since been closed, or quietly reverse the change.
      addCourt: (name) => {
        const session = requireSession(get().session)
        set({ session: addCourtEngine(session, name), previous: null })
      },

      renameCourt: (courtId, name) => {
        const session = requireSession(get().session)
        set({ session: renameCourtEngine(session, courtId, name), previous: null })
      },

      moveCourt: (courtId, offset) => {
        const session = requireSession(get().session)
        set({ session: moveCourtEngine(session, courtId, offset), previous: null })
      },

      closeCourt: (courtId) => {
        const session = requireSession(get().session)
        // A cancelled game's players wait at the front of the queue until staff start a game.
        set({ session: closeCourtEngine(session, courtId), previous: null })
      },

      replacePlayer: (courtId, outId, inId) => {
        const session = requireSession(get().session)
        set({ session: replacePlayerEngine(session, courtId, outId, inId), previous: null })
      },

      lockPartners: (a, b) => {
        const session = requireSession(get().session)
        set({ session: lockPartnersEngine(session, a, b), previous: null })
      },

      unlockPartners: (playerId) => {
        const session = requireSession(get().session)
        set({ session: unlockPartnersEngine(session, playerId), previous: null })
      },

      loadSession: (location, session) => set({ location, session, previous: null }),

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
