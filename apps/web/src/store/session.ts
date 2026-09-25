import { MAX_LOCATION_LENGTH } from '@q2dink/shared'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  createSession,
  playingIds,
  setAvgGameMinutes as setAvgGameMinutesEngine,
  renamePlayer as renamePlayerEngine,
  setPlayerSkill as setPlayerSkillEngine,
  shiftSessionClock,
  type MatchEdit,
  type NextGroupOptions,
  type ReplacePlayerOptions,
  type SessionOptions,
} from '@/rotation/engine'
import { applyAction, rebase, type PendingAction, type Rebased, type SessionAction } from './actions'
import type { SkillLevel } from '@/db/db'
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
  /**
   * While the session is shared with the club (several staff devices can run it): the club's copy as
   * this device last had it, and its revision. `session` is always `base.session` with `pending` applied.
   * Null when not shared (no cloud, or not sent yet).
   */
  base: { revision: number; session: SessionState } | null
  /** This device's changes the club has not taken yet, oldest first. Empty while not shared. */
  pending: PendingAction[]
  /**
   * A session that ended here whose end the club may not have been told yet (the app can close or
   * reload right after), so the cloud sync ends exactly that one there first. Empty once it is told.
   */
  endedSessionId: string
  /**
   * The session was renamed here and the club has not taken the new name yet. Until then, a club copy
   * adopted from another device keeps this name rather than bringing the old one back.
   */
  locationPending: boolean

  startSession: (
    location: string,
    mode: GameMode,
    courtCount: number,
    options?: SessionOptions,
  ) => void
  /** Rename the running session. Throws a RangeError with a readable message if the name is not allowed. */
  renameSession: (name: string) => void
  setAvgGameMinutes: (minutes: number) => void
  /** Change a checked-in player's skill level. Future matching follows it; a pending result undo stays. */
  setPlayerSkill: (playerId: number, skill: SkillLevel) => void
  /** Rename a checked-in player. Throws a RangeError with a readable message if the name is not allowed. */
  renamePlayer: (playerId: number, name: string) => void
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
  /**
   * Correct an already-recorded match's score and/or which players were on each team. Recomputes
   * every player's stats from the whole corrected match history. Throws a RangeError for an
   * invalid score, or an Error for an out-of-range match index.
   */
  editMatch: (matchIndex: number, edit: MatchEdit) => void
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
  /** Keep a court for a range of skill levels (min, max), or any level with null. Throws a RangeError for a bad range. */
  setCourtLevels: (courtId: number, levels: [number, number] | null) => void
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

  /** Start sharing the running session with the club: from now on changes are kept until it has them. */
  shareSession: () => void
  /**
   * The club took this session, with the first `count` pending changes in it, at `revision`, under the
   * name `sentLocation` (a rename made while it was being sent stays pending).
   */
  confirmPublished: (count: number, sent: SessionState, revision: number, sentLocation?: string) => void
  /**
   * Another staff device moved the club's copy on: take it, and apply this device's unsent changes on
   * top, and its name unless this device renamed the session and has not sent that yet. Returns the
   * changes that no longer applied, and why.
   */
  rebaseOnto: (revision: number, session: SessionState, clubLocation?: string) => Rebased['dropped']
  /** Run the club's session here too, alongside the device that started it. */
  joinShared: (location: string, session: SessionState, meta: ResumeMeta, revision: number) => void
}

/** What identifies a session across ending and resuming it. */
export interface ResumeMeta {
  sessionId: string
  startedAt: number
  lifetimeCounted: LifetimeCounts
  /**
   * When the session ended (ms since the epoch), if it did. Given only when resuming a session
   * that was actually ended (the toast's "Resume", or Past sessions) — never for picking up a
   * session another staff device is actively running, which never ended. When given, wait times
   * and an in-progress game's elapsed time are frozen at what they were when it ended, instead of
   * counting the gap until now as more waiting/playing.
   */
  endedAt?: number
}

const requireSession = (session: SessionState | null) => {
  if (!session) throw new Error('No session in progress')
  return session
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => {
      /**
       * Apply one change here and, while the session is shared with the club, keep it until the club has
       * it, so it can be applied again on the club's copy if another staff device changed that meanwhile.
       */
      const dispatch = (action: SessionAction, previous: SessionState | null) => {
        const session = requireSession(get().session)
        const applied = applyAction(session, action)
        const { base, pending } = get()
        set({
          session: applied.session,
          previous,
          ...(base ? { pending: [...pending, { action, ...(applied.ids ? { ids: applied.ids } : {}) }] } : {}),
        })
      }

      return {
        location: '',
        session: null,
        previous: null,
        sessionId: '',
        startedAt: 0,
        lifetimeCounted: {},
        base: null,
        pending: [],
        endedSessionId: '',
        locationPending: false,

        startSession: (location, mode, courtCount, options) =>
          set({
            location,
            session: createSession(mode, courtCount, options),
            previous: null,
            sessionId: newBatchId(),
            startedAt: Date.now(),
            lifetimeCounted: {},
            base: null,
            pending: [],
            locationPending: false,
          }),

        renameSession: (name) => {
          requireSession(get().session)
          const trimmed = name.trim()
          if (!trimmed) throw new RangeError('Enter a session name.')
          if (trimmed.length > MAX_LOCATION_LENGTH) {
            throw new RangeError(`Keep the name to ${MAX_LOCATION_LENGTH} characters or fewer.`)
          }
          if (trimmed === get().location) return
          // While shared, the club has to be sent the new name even with no other change pending.
          set((state) => ({ location: trimmed, locationPending: state.base !== null }))
        },

        setAvgGameMinutes: (minutes) => {
          const { previous } = get()
          // A setting, not a game event: keep the pending result undo, but carry the
          // new value into its snapshot so undoing a result never reverts the setting.
          dispatch({ type: 'setAvgGameMinutes', minutes }, previous && setAvgGameMinutesEngine(previous, minutes))
        },

        setPlayerSkill: (playerId, skill) => {
          const { previous } = get()
          // Like the game length, a correction rather than a game event: keep the pending result undo,
          // and carry the new level into its snapshot so undoing a result never reverts it.
          dispatch(
            { type: 'setPlayerSkill', playerId, skill },
            previous?.players[playerId] ? setPlayerSkillEngine(previous, playerId, skill) : previous,
          )
        },

        renamePlayer: (playerId, name) => {
          const { previous } = get()
          // A correction, like a skill change: undoing a result must never bring the old name back.
          dispatch(
            { type: 'renamePlayer', playerId, name },
            previous?.players[playerId] ? renamePlayerEngine(previous, playerId, name) : previous,
          )
        },

        checkInPlayer: (player) => get().checkInPlayers([player]) === 1,

        checkInPlayers: (players) => {
          const session = requireSession(get().session)
          const action: SessionAction = {
            type: 'checkIn',
            players: players.map(({ name, skill, gender }) => ({ name, skill, ...(gender ? { gender } : {}) })),
            now: Date.now(),
          }
          // Players already waiting or playing (matched by name) are not checked in again.
          const waiting = new Set([...session.queue, ...playingIds(session)])
          const { ids = [] } = applyAction(session, action)
          const added = new Set(ids.filter((id) => !waiting.has(id))).size
          if (added > 0) dispatch(action, null)
          return added
        },

        checkOutPlayer: (playerId) => dispatch({ type: 'checkOut', playerId }, null),

        recordResult: (courtId, winner) =>
          dispatch({ type: 'recordResult', courtId, winner, now: Date.now() }, requireSession(get().session)),

        recordScore: (courtId, scoreA, scoreB) =>
          dispatch({ type: 'recordScore', courtId, scoreA, scoreB, now: Date.now() }, requireSession(get().session)),

        editMatch: (matchIndex, edit) => dispatch({ type: 'editMatch', matchIndex, edit }, null),

        undo: () => {
          const { previous, session } = get()
          if (!previous || !session) return false
          dispatch({ type: 'restore', before: previous, after: session }, null)
          return true
        },

        cancelMatch: (courtId) => dispatch({ type: 'cancelMatch', courtId, now: Date.now() }, null),

        startGame: (courtId, options) =>
          dispatch({ type: 'startGame', courtId, ...(options ? { options } : {}), now: Date.now() }, null),

        // Court changes clear the result undo: undoing a result would otherwise put players back
        // on a court that has since been closed, or quietly reverse the change.
        addCourt: (name) => dispatch({ type: 'addCourt', ...(name !== undefined ? { name } : {}) }, null),

        renameCourt: (courtId, name) => dispatch({ type: 'renameCourt', courtId, name }, null),

        setCourtLevels: (courtId, levels) => dispatch({ type: 'setCourtLevels', courtId, levels }, null),

        moveCourt: (courtId, offset) => dispatch({ type: 'moveCourt', courtId, offset }, null),

        // A cancelled game's players wait at the front of the queue until staff start a game.
        closeCourt: (courtId) => dispatch({ type: 'closeCourt', courtId, now: Date.now() }, null),

        replacePlayer: (courtId, outId, inId, options) =>
          dispatch(
            {
              type: 'replacePlayer',
              courtId,
              outId,
              ...(inId !== undefined ? { inId } : {}),
              ...(options ? { options } : {}),
              now: Date.now(),
            },
            null,
          ),

        replaceNextUp: (outId, inId) => dispatch({ type: 'replaceNextUp', outId, inId }, null),

        resetNextUp: () => dispatch({ type: 'resetNextUp' }, null),

        lockPartners: (a, b) => dispatch({ type: 'lockPartners', a, b }, null),

        unlockPartners: (playerId) => dispatch({ type: 'unlockPartners', playerId }, null),

        loadSession: (location, session, meta) =>
          set({
            location,
            session: meta?.endedAt === undefined ? session : shiftSessionClock(session, Date.now() - meta.endedAt),
            previous: null,
            // Resuming keeps the session's identity, so ending it again updates its history entry.
            sessionId: meta?.sessionId ?? newBatchId(),
            startedAt: meta?.startedAt ?? Date.now(),
            lifetimeCounted: meta?.lifetimeCounted ?? {},
            base: null,
            pending: [],
            locationPending: false,
          }),

        shareSession: () => {
          const { session, base } = get()
          if (session && !base) set({ base: { revision: 0, session }, pending: [] })
        },

        confirmPublished: (count, sent, revision, sentLocation) =>
          set((state) => ({
            base: { revision, session: sent },
            pending: state.pending.slice(count),
            locationPending: state.locationPending && sentLocation !== state.location,
          })),

        rebaseOnto: (revision, clubSession, clubLocation) => {
          const { session, pending, locationPending } = get()
          if (!session) return []
          const rebased = rebase(clubSession, pending)
          set({
            base: { revision, session: clubSession },
            session: rebased.session,
            pending: rebased.pending,
            previous: null,
            ...(clubLocation !== undefined && !locationPending ? { location: clubLocation } : {}),
          })
          return rebased.dropped
        },

        joinShared: (location, session, meta, revision) =>
          set({
            location,
            session,
            previous: null,
            sessionId: meta.sessionId,
            startedAt: meta.startedAt,
            lifetimeCounted: meta.lifetimeCounted,
            base: { revision, session },
            pending: [],
            locationPending: false,
          }),

        /** Record which all-time totals this session has now contributed, after saving them. */
        markLifetimeCounted: (counted) => set({ lifetimeCounted: counted }),

        endSession: () =>
          set((state) => ({
            location: '',
            session: null,
            previous: null,
            sessionId: '',
            startedAt: 0,
            lifetimeCounted: {},
            base: null,
            pending: [],
            locationPending: false,
            endedSessionId: state.session ? state.sessionId : state.endedSessionId,
          })),
      }
    },
    {
      name: 'q2dink-session',
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
      // `base` and `pending` are kept, so changes made offline still reach the club after a reload.
      partialize: ({ location, session, sessionId, startedAt, lifetimeCounted, base, pending, endedSessionId, locationPending }) => ({
        location,
        locationPending,
        session,
        sessionId,
        startedAt,
        lifetimeCounted,
        base,
        pending,
        endedSessionId,
      }),
    },
  ),
)

/** Number of players currently checked in and not on a break (queued or playing). */
export const activePlayerCount = (session: SessionState) =>
  session.queue.length + playingIds(session).length
