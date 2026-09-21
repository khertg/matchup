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
  recordScore as recordScoreEngine,
  renameCourt as renameCourtEngine,
  replaceNextUp as replaceNextUpEngine,
  replacePlayer as replacePlayerEngine,
  resetNextUp as resetNextUpEngine,
  setAvgGameMinutes as setAvgGameMinutesEngine,
  type NextGroupOptions,
  type ReplacePlayerOptions,
  type SessionOptions,
  startGame as startGameEngine,
  unlockPartners as unlockPartnersEngine,
} from '@/rotation/engine'
import type { GameMode, RosterPlayer, SessionState } from '@/rotation/types'
import { newBatchId } from '@/cloud/id'
import type { LifetimeCounts } from '@/rotation/lifetime'
import { migrateSession, SESSION_STORE_VERSION } from './migrate'

interface SessionStore {
  location: string
  session: SessionState | null
  /** Snapshot from before the last recorded result; cleared by any other change. */
  previous: SessionState | null
  /** Identifies this session in history; a resumed session keeps it. Empty when none is running. */
  sessionId: string
  /** When the session began (ms since the epoch). */
  startedAt: number
  /** What this session has already added to the all-time totals. */
  lifetimeCounted: LifetimeCounts

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
  /**
   * Record a game from its score (Team A, then Team B); the higher score wins. Throws a RangeError
   * for equal or out-of-range scores. One change, undone exactly like recordResult.
   */
  recordScore: (courtId: number, scoreA: number, scoreB: number) => void
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
  /**
   * Swap a playing player for a waiting one (defaults to the front of the queue). The player who
   * comes off goes to the front of the queue, or on a break with `sendOnBreak`.
   */
  replacePlayer: (courtId: number, outId: number, inId?: number, options?: ReplacePlayerOptions) => void
  /** Put a waiting player in the next group in place of one of its players. The group stays as chosen. */
  replaceNextUp: (outId: number, inId: number) => void
  /** Go back to the automatic next group. */
  resetNextUp: () => void
  /** Lock two checked-in players as doubles partners. */
  lockPartners: (a: number, b: number) => void
  unlockPartners: (playerId: number) => void
  /** Replace the running session, for example one resumed from the cloud on another device. */
  loadSession: (location: string, session: SessionState, meta?: ResumeMeta) => void
  /** Remember what has been added to the all-time totals, so a resumed session adds only what is new. */
  markLifetimeCounted: (counted: LifetimeCounts) => void
  endSession: () => void
}

/** What identifies a session across ending and resuming it. */
export interface ResumeMeta {
  sessionId: string
  startedAt: number
  lifetimeCounted: LifetimeCounts
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
      sessionId: '',
      startedAt: 0,
      lifetimeCounted: {},

      startSession: (location, mode, courtCount, options) =>
        set({
          location,
          session: createSession(mode, courtCount, options),
          previous: null,
          sessionId: newBatchId(),
          startedAt: Date.now(),
          lifetimeCounted: {},
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
        const { state } = recordResultEngine(session, courtId, winner, { now: Date.now() })
        set({ session: state, previous: session })
      },

      recordScore: (courtId, scoreA, scoreB) => {
        const session = requireSession(get().session)
        const { state } = recordScoreEngine(session, courtId, scoreA, scoreB, { now: Date.now() })
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
        set({ session: startGameEngine(session, courtId, { ...options, now: Date.now() }), previous: null })
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

      replacePlayer: (courtId, outId, inId, options) => {
        const session = requireSession(get().session)
        set({ session: replacePlayerEngine(session, courtId, outId, inId, options), previous: null })
      },

      replaceNextUp: (outId, inId) => {
        const session = requireSession(get().session)
        set({ session: replaceNextUpEngine(session, outId, inId), previous: null })
      },

      resetNextUp: () => {
        const session = requireSession(get().session)
        set({ session: resetNextUpEngine(session), previous: null })
      },

      lockPartners: (a, b) => {
        const session = requireSession(get().session)
        set({ session: lockPartnersEngine(session, a, b), previous: null })
      },

      unlockPartners: (playerId) => {
        const session = requireSession(get().session)
        set({ session: unlockPartnersEngine(session, playerId), previous: null })
      },

      loadSession: (location, session, meta) =>
        set({
          location,
          session,
          previous: null,
          // Resuming keeps the session's identity, so ending it again updates its history entry.
          sessionId: meta?.sessionId ?? newBatchId(),
          startedAt: meta?.startedAt ?? Date.now(),
          lifetimeCounted: meta?.lifetimeCounted ?? {},
        }),

      /** Record which all-time totals this session has now contributed, after saving them. */
      markLifetimeCounted: (counted) => set({ lifetimeCounted: counted }),

      endSession: () =>
        set({ location: '', session: null, previous: null, sessionId: '', startedAt: 0, lifetimeCounted: {} }),
    }),
    {
      name: 'matchup-session',
      version: SESSION_STORE_VERSION,
      migrate: (persisted, version) => {
        const saved = persisted as {
          location: string
          session: SessionState | null
          sessionId?: string
          startedAt?: number
          lifetimeCounted?: LifetimeCounts
        }
        // A session already running when history arrived gets an identity now.
        return {
          ...saved,
          session: migrateSession(saved.session, version),
          sessionId: saved.sessionId ?? (saved.session ? newBatchId() : ''),
          startedAt: saved.startedAt ?? (saved.session ? Date.now() : 0),
          lifetimeCounted: saved.lifetimeCounted ?? {},
        }
      },
      storage: createJSONStorage(() => localStorage),
      // The undo snapshot only makes sense for a few seconds, so never persist it.
      partialize: ({ location, session, sessionId, startedAt, lifetimeCounted }) => ({
        location,
        session,
        sessionId,
        startedAt,
        lifetimeCounted,
      }),
    },
  ),
)

/** Number of players currently checked in and not on a break (queued or playing). */
export const activePlayerCount = (session: SessionState) =>
  session.queue.length + playingIds(session).length
