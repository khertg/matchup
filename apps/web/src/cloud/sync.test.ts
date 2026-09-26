import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The stores persist to localStorage; give the node test environment a tiny in-memory one.
vi.hoisted(() => {
  const data = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  })
})

// Keeping an ended session goes to IndexedDB, which node does not have: record what would be kept.
vi.mock('@/db/history', async (importActual) => ({
  ...(await importActual<typeof import('@/db/history')>()),
  archiveSession: vi.fn(async (input: { now?: number }) => input),
  markHistorySynced: vi.fn(async () => {}),
}))

import type { HistorySummary, LiveRow, PublishMeta, SessionStateRow } from '@q2dink/shared'
import { archiveSession } from '@/db/history'
import { playedMs } from '@/rotation/engine'
import type { RosterPlayer, SessionState } from '@/rotation/types'
import { applyAction } from '@/store/actions'
import { useSessionStore } from '@/store/session'
import { CloudError, type CloudApi } from './api'
import { useClubAuth } from './auth'
import { toFullBackup } from './snapshot'
import {
  checkLogin,
  flushPendingLifetime,
  joinClubSession,
  keepMySession,
  startCloudSync,
  syncMedia,
  useSyncStore,
} from './sync'

const club = { slug: 'downtown', name: 'Downtown', token: 'tok-1' }

type AsyncMock = ReturnType<typeof vi.fn<(...args: unknown[]) => Promise<void>>>

/**
 * A club server holding one shared session, with revisions like the real one: a write made on an older
 * revision is refused with the club's copy. `server` is what another staff device would change.
 */
function fakeApi(
  overrides: { publish?: AsyncMock; clear?: AsyncMock; recordLifetime?: AsyncMock; fetchFullSession?: AsyncMock } = {},
) {
  const server: {
    row: SessionStateRow | null
    live: Set<(row: LiveRow | null) => void>
    /** The club's ended sessions, or null when the list cannot be fetched. */
    history: HistorySummary[] | null
  } = { row: null, live: new Set(), history: [] }
  const publish = async (_token: unknown, _snap: unknown, backup: unknown, meta: PublishMeta = {}) => {
    const stored = server.row
    if (meta.baseRevision !== undefined) {
      if (!stored) {
        if (meta.baseRevision > 0) return { conflict: null }
      } else if (
        (meta.sessionId && stored.sessionId && stored.sessionId !== meta.sessionId) ||
        stored.revision !== meta.baseRevision
      ) {
        return { conflict: stored }
      }
    }
    server.row = {
      revision: (stored?.revision ?? 0) + 1,
      sessionId: meta.sessionId ?? stored?.sessionId ?? null,
      startedAt: meta.startedAt ?? null,
      full: JSON.parse(JSON.stringify(backup)),
    }
    return { revision: server.row.revision }
  }
  const api = {
    publish: overrides.publish ?? vi.fn(publish),
    clear:
      overrides.clear ??
      vi.fn(async () => {
        server.row = null
      }),
    recordLifetime:
      overrides.recordLifetime ?? vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
    fetchFullSession: overrides.fetchFullSession ?? vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
    fetchSessionState: vi.fn(async () => server.row),
    listHistory: vi.fn(async () => {
      if (!server.history) throw new CloudError('network')
      return server.history
    }),
    // Like the real stream: every change to the club's copy also comes as a revision signal.
    subscribeLive: vi.fn(
      (_slug: string, onChange: (row: LiveRow | null) => void, onRevision?: (revision: number) => void) => {
        const listener = (row: LiveRow | null) => {
          onChange(row)
          if (row?.revision !== undefined) onRevision?.(row.revision)
        }
        server.live.add(listener)
        return () => server.live.delete(listener)
      },
    ),
  }
  /** Another staff device changes the club's copy, and the live stream says so. */
  const otherDevice = (change: (session: SessionState) => SessionState, sessionId = server.row?.sessionId ?? null) => {
    const current = server.row!
    const full = current.full as { location: string; session: SessionState }
    server.row = {
      ...current,
      sessionId,
      revision: current.revision + 1,
      full: toFullBackup(full.location, change(full.session)),
    }
    for (const listener of server.live) listener({ state: {}, updatedAt: '', revision: server.row.revision })
  }
  return { api, cloudApi: api as unknown as CloudApi, server, otherDevice }
}

const player = (id: number): RosterPlayer => ({ id, name: `P${id}`, skill: 3, gender: 'F' })
const session = () => useSessionStore.getState()

let listeners: Map<string, Set<() => void>>
const online = { value: true }

beforeEach(() => {
  vi.useFakeTimers()
  listeners = new Map()
  online.value = true
  vi.stubGlobal('navigator', { get onLine() { return online.value } })
  vi.stubGlobal('window', {
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
  })
  const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn())
  ;(globalThis as { fire?: (t: string) => void }).fire = fire

  useSessionStore.setState({ location: '', session: null, previous: null, base: null, pending: [] })
  useClubAuth.setState({ club: null, pendingLifetime: [] })
  useSyncStore.setState({ status: 'off', clubSession: null, otherSession: null, keepMine: false })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const fire = (type: string) => (globalThis as unknown as { fire: (t: string) => void }).fire(type)

describe('flushPendingLifetime', () => {
  const batch = (batchId: string, slug = 'downtown') => ({
    batchId,
    slug,
    players: [{ name: 'Ann', games: 2, wins: 2, losses: 0 }],
  })

  it('sends this club\'s queued totals once and removes them', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club, pendingLifetime: [batch('a'), batch('b'), batch('other', 'elsewhere')] })

    expect(await flushPendingLifetime(cloudApi)).toBe(true)
    expect(api.recordLifetime).toHaveBeenCalledTimes(2)
    expect(api.recordLifetime).toHaveBeenCalledWith('tok-1', 'a', batch('a').players)
    expect(useClubAuth.getState().pendingLifetime.map((p) => p.batchId)).toEqual(['other'])
  })

  it('keeps totals queued when the network fails, so a later retry can send them', async () => {
    const { cloudApi } = fakeApi({
      recordLifetime: vi.fn(async () => {
        throw new CloudError('network')
      }),
    })
    useClubAuth.setState({ club, pendingLifetime: [batch('a')] })

    expect(await flushPendingLifetime(cloudApi)).toBe(false)
    expect(useClubAuth.getState().pendingLifetime).toHaveLength(1)
    expect(useClubAuth.getState().club).not.toBeNull()
  })

  it('signs out when the club login has expired', async () => {
    const { cloudApi } = fakeApi({
      recordLifetime: vi.fn(async () => {
        throw new CloudError('invalid_token')
      }),
    })
    useClubAuth.setState({ club, pendingLifetime: [batch('a')] })

    await flushPendingLifetime(cloudApi)
    expect(useClubAuth.getState().club).toBeNull()
  })

  it('does nothing when signed out or when cloud is not configured', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club: null, pendingLifetime: [batch('a')] })
    expect(await flushPendingLifetime(cloudApi)).toBe(false)
    expect(await flushPendingLifetime(null)).toBe(false)
    expect(api.recordLifetime).not.toHaveBeenCalled()
  })
})

describe('syncMedia when the device storage cannot be read', () => {
  // This file has no IndexedDB, like a private window that blocks it.
  it('reports a failed sync instead of rejecting, so callers that do not wait never see an unhandled error', async () => {
    const { cloudApi } = fakeApi()
    useClubAuth.setState({ club })
    await expect(syncMedia(cloudApi)).resolves.toBe(false)
  })
})

describe('checkLogin', () => {
  it('signs out when the server says the saved login has expired', async () => {
    const fetchFullSession = vi.fn<(...args: unknown[]) => Promise<void>>().mockRejectedValue(new CloudError('invalid_token'))
    const { api, cloudApi } = fakeApi({ fetchFullSession })
    useClubAuth.setState({ club })
    await checkLogin(cloudApi)
    expect(api.fetchFullSession).toHaveBeenCalledWith('tok-1')
    expect(useClubAuth.getState().club).toBeNull()
  })

  it('stays logged in when the server cannot be reached, so the app keeps working offline', async () => {
    const fetchFullSession = vi.fn<(...args: unknown[]) => Promise<void>>().mockRejectedValue(new CloudError('network'))
    const { cloudApi } = fakeApi({ fetchFullSession })
    useClubAuth.setState({ club })
    await checkLogin(cloudApi)
    expect(useClubAuth.getState().club).toEqual(club)
  })

  it('stays logged in on a server error', async () => {
    const fetchFullSession = vi.fn<(...args: unknown[]) => Promise<void>>().mockRejectedValue(new CloudError('internal_error'))
    const { cloudApi } = fakeApi({ fetchFullSession })
    useClubAuth.setState({ club })
    await checkLogin(cloudApi)
    expect(useClubAuth.getState().club).toEqual(club)
  })

  it('does not ask the server when nobody is logged in', async () => {
    const { api, cloudApi } = fakeApi()
    await checkLogin(cloudApi)
    expect(api.fetchFullSession).not.toHaveBeenCalled()
  })

  it('does not sign out a newer login because of an answer about the old one', async () => {
    let reject: (error: unknown) => void = () => {}
    const fetchFullSession = vi.fn<(...args: unknown[]) => Promise<void>>(() => new Promise((_, r) => (reject = r)))
    const { cloudApi } = fakeApi({ fetchFullSession })
    useClubAuth.setState({ club })
    const pending = checkLogin(cloudApi)
    useClubAuth.setState({ club: { ...club, token: 'tok-2' } })
    reject(new CloudError('invalid_token'))
    await pending
    expect(useClubAuth.getState().club?.token).toBe('tok-2')
  })
})

describe('startCloudSync', () => {
  it('checks the saved login when it starts and again when the connection returns', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club })
    const stop = startCloudSync(cloudApi)
    expect(api.fetchFullSession).toHaveBeenCalledTimes(1)
    fire('online')
    expect(api.fetchFullSession).toHaveBeenCalledTimes(2)
    stop()
  })

  it('does not check anything while signed out', () => {
    const { api, cloudApi } = fakeApi()
    const stop = startCloudSync(cloudApi)
    fire('online')
    expect(api.fetchFullSession).not.toHaveBeenCalled()
    stop()
  })

  it('does nothing without cloud credentials', () => {
    expect(startCloudSync(null)()).toBeUndefined()
  })

  it('publishes session changes while signed in, without private details', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club })
    const stop = startCloudSync(cloudApi)

    session().startSession('Downtown Open', 'doubles', 1)
    session().checkInPlayer(player(1))
    await vi.advanceTimersByTimeAsync(500)

    expect(api.publish).toHaveBeenCalledTimes(1)
    const [token, publicSnap, backup] = api.publish.mock.calls[0] as unknown as [string, { location: string }, { session: unknown }]
    expect(token).toBe('tok-1')
    expect(publicSnap.location).toBe('Downtown Open')
    expect(JSON.stringify(publicSnap)).not.toContain('gender')
    expect(JSON.stringify(backup)).toContain('gender') // the private backup keeps everything
    expect(useSyncStore.getState().status).toBe('synced')
    stop()
  })

  it('tells the club whether the session is on the public page: not until staff go live', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club })
    const stop = startCloudSync(cloudApi)
    session().startSession('Downtown Open', 'doubles', 1)
    session().checkInPlayer(player(1))
    await vi.advanceTimersByTimeAsync(500)
    const meta = (call: number) => (api.publish.mock.calls[call] as unknown as [unknown, unknown, unknown, { live?: boolean }])[3]
    expect(meta(0).live).toBe(false)

    session().setLive(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(meta(1).live).toBe(true)
    stop()
  })

  it('publishes nothing while signed out', async () => {
    const { api, cloudApi } = fakeApi()
    const stop = startCloudSync(cloudApi)
    session().startSession('Local only', 'doubles', 1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.publish).not.toHaveBeenCalled()
    expect(useSyncStore.getState().status).toBe('off')
    stop()
  })

  it('publishes an already-running session as soon as staff sign in', async () => {
    const { api, cloudApi } = fakeApi()
    const stop = startCloudSync(cloudApi)
    session().startSession('Started offline', 'doubles', 1)

    useClubAuth.getState().signIn(club)
    await vi.advanceTimersByTimeAsync(500)
    expect(api.publish).toHaveBeenCalledTimes(1)
    stop()
  })

  it('never clears the cloud session just because a device with no session signs in', async () => {
    const { api, cloudApi } = fakeApi()
    const stop = startCloudSync(cloudApi)
    useClubAuth.getState().signIn(club)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.clear).not.toHaveBeenCalled()
    expect(api.publish).not.toHaveBeenCalled()
    stop()
  })

  it('clears the live session when the session ends', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club })
    const stop = startCloudSync(cloudApi)
    session().startSession('Club', 'doubles', 1)
    await vi.advanceTimersByTimeAsync(500)

    const { sessionId } = session()
    session().endSession()
    await vi.advanceTimersByTimeAsync(500)
    // Only this session: never one another device has started since.
    expect(api.clear).toHaveBeenCalledWith('tok-1', sessionId)
    stop()
  })

  it('signs out and stops retrying when the login has expired', async () => {
    const { api, cloudApi } = fakeApi({
      publish: vi.fn(async () => {
        throw new CloudError('invalid_token')
      }),
    })
    useClubAuth.setState({ club })
    const stop = startCloudSync(cloudApi)
    session().startSession('Club', 'doubles', 1)
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(useClubAuth.getState().club).toBeNull()
    expect(api.publish).toHaveBeenCalledTimes(1)
    stop()
  })

  it('waits while offline and publishes the latest state when the connection returns', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club })
    const stop = startCloudSync(cloudApi)

    online.value = false
    session().startSession('Offline Club', 'doubles', 1)
    session().checkInPlayer(player(1))
    session().checkInPlayer(player(2))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.publish).not.toHaveBeenCalled()
    expect(useSyncStore.getState().status).toBe('offline')

    online.value = true
    fire('online')
    await vi.advanceTimersByTimeAsync(0)
    expect(api.publish).toHaveBeenCalledTimes(1)
    const backup = api.publish.mock.calls[0][2] as unknown as { session: { queue: number[] } }
    expect(backup.session.queue).toEqual([1, 2])
    stop()
  })

  describe('with another staff device running the same session', () => {
    const names = () => session().session!.queue.map((id) => session().session!.players[id].name)
    const checkInOther = (name: string) => (s: SessionState) =>
      applyAction(s, { type: 'checkIn', players: [{ name, skill: 3 }], now: 0 }).session

    async function started(api: ReturnType<typeof fakeApi>) {
      useClubAuth.setState({ club })
      const stop = startCloudSync(api.cloudApi)
      session().startSession('Shared', 'doubles', 1)
      session().checkInPlayer(player(1))
      await vi.advanceTimersByTimeAsync(500)
      expect(api.server.row?.revision).toBe(1)
      return stop
    }

    it('takes the other device’s changes and keeps its own unsent ones on top', async () => {
      const fake = fakeApi()
      const stop = await started(fake)
      session().checkInPlayer(player(3)) // not sent yet
      fake.otherDevice(checkInOther('Bob'))
      await vi.advanceTimersByTimeAsync(0)
      expect(names()).toEqual(['P1', 'Bob', 'P3'])

      await vi.advanceTimersByTimeAsync(500)
      const club = fake.server.row!.full as { session: SessionState }
      expect(Object.values(club.session.players).map((p) => p.name)).toEqual(['P1', 'Bob', 'P3'])
      expect(session().pending).toEqual([])
      stop()
    })

    it('when refused as out of date, applies its change on the club’s copy and sends again', async () => {
      const fake = fakeApi()
      const stop = await started(fake)
      // The other device's change arrives without the stream noticing.
      fake.server.live.clear()
      fake.otherDevice(checkInOther('Bob'))
      session().checkInPlayer(player(3))
      await vi.advanceTimersByTimeAsync(500)
      await vi.advanceTimersByTimeAsync(500)
      expect(fake.server.row!.revision).toBe(3)
      expect(names()).toEqual(['P1', 'Bob', 'P3'])
      stop()
    })

    it('drops a change the other device already made, keeping theirs', async () => {
      const fake = fakeApi()
      const stop = await started(fake)
      for (const n of [2, 3, 4]) session().checkInPlayer(player(n))
      await vi.advanceTimersByTimeAsync(500)
      session().startGame(1)
      await vi.advanceTimersByTimeAsync(500)

      // Both finish Court 1: the other device first.
      fake.server.live.clear()
      fake.otherDevice((s) => applyAction(s, { type: 'recordScore', courtId: 1, scoreA: 11, scoreB: 3, now: 0 }).session)
      session().recordScore(1, 5, 11)
      await vi.advanceTimersByTimeAsync(1000)
      const matches = session().session!.matches ?? []
      expect(matches).toHaveLength(1)
      expect(matches[0].score).toEqual([11, 3])
      expect(session().pending).toEqual([])
      stop()
    })

    it('leaves the session when another device ends it', async () => {
      const fake = fakeApi()
      const stop = await started(fake)
      fake.server.row = null
      for (const listener of fake.server.live) listener(null)
      await vi.advanceTimersByTimeAsync(0)
      expect(session().session).toBeNull()
      stop()
    })

    describe('when this device only finds out hours later that the session ended', () => {
      const HOUR = 60 * 60 * 1000

      /** A game on Court 1 and P5 waiting, then the other device ends it while this one is asleep. */
      async function endedWhileAsleep(fake: ReturnType<typeof fakeApi>) {
        const stop = await started(fake)
        for (const n of [2, 3, 4]) session().checkInPlayer(player(n))
        await vi.advanceTimersByTimeAsync(500)
        session().startGame(1)
        await vi.advanceTimersByTimeAsync(500)
        session().checkInPlayer(player(5))
        await vi.advanceTimersByTimeAsync(500)
        const { location, sessionId } = session()
        const endedAt = Date.now()
        fake.server.row = null
        fake.server.history &&= [
          { id: sessionId, location, endedAt: new Date(endedAt).toISOString(), mode: 'doubles', players: 5, games: 0 },
        ]
        vi.mocked(archiveSession).mockClear()

        // Overnight, then the app opens again and the stream says there is no session.
        vi.setSystemTime(endedAt + 8 * HOUR)
        for (const listener of fake.server.live) listener(null)
        await vi.advanceTimersByTimeAsync(0)
        stop()
        expect(session().session).toBeNull()
        expect(archiveSession).toHaveBeenCalledTimes(1)
        const archived = vi.mocked(archiveSession).mock.calls[0][0]
        return { endedAt, archived }
      }

      /** Resume it as Past sessions does: every timer carries on from where it stood, with nothing added. */
      function expectResumedWithoutTheGap(archived: Parameters<typeof archiveSession>[0]) {
        const { id: sessionId, startedAt, lifetimeCounted, now: endedAt } = archived
        session().loadSession(archived.location, archived.session, { sessionId, startedAt, lifetimeCounted, endedAt: endedAt! })
        const resumed = session().session!
        const now = Date.now()
        expect(playedMs(resumed.courts[0], now)).toBeLessThan(60_000)
        for (const id of resumed.queue) expect(now - resumed.queuedAt![id]).toBeLessThan(60_000)
      }

      it('records when the session really ended, so resuming it later adds no time', async () => {
        const fake = fakeApi()
        const { endedAt, archived } = await endedWhileAsleep(fake)
        expect(archived.now).toBe(endedAt)
        expectResumedWithoutTheGap(archived)
      })

      it('without the club’s history, records the session’s last activity instead', async () => {
        const fake = fakeApi()
        fake.server.history = null
        const { endedAt, archived } = await endedWhileAsleep(fake)
        expect(archived.now).toBeGreaterThan(endedAt - 60_000)
        expect(archived.now).toBeLessThanOrEqual(endedAt)
        expectResumedWithoutTheGap(archived)
      })
    })

    it('stops sending when another device started a different session, until staff choose', async () => {
      const fake = fakeApi()
      const stop = await started(fake)
      fake.otherDevice((s) => s, '00000000-0000-4000-8000-0000000000ff')
      await vi.advanceTimersByTimeAsync(0)
      expect(useSyncStore.getState().otherSession?.sessionId).toBe('00000000-0000-4000-8000-0000000000ff')
      const sent = fake.api.publish.mock.calls.length
      session().checkInPlayer(player(5))
      await vi.advanceTimersByTimeAsync(1000)
      expect(fake.api.publish.mock.calls.length).toBe(sent)

      // Keep this one: it replaces theirs.
      keepMySession()
      await vi.advanceTimersByTimeAsync(1000)
      expect(fake.server.row!.sessionId).toBe(session().sessionId)
      expect(useSyncStore.getState().otherSession).toBeNull()
      stop()
    })

    it('joins the club’s running session, with its identity, and sends nothing until something changes', async () => {
      const fake = fakeApi()
      const stop = await started(fake)
      const row = fake.server.row!
      session().endSession()
      await vi.advanceTimersByTimeAsync(500)
      fake.server.row = row // still running elsewhere

      expect(joinClubSession(row)).toBe(true)
      expect(session().sessionId).toBe(row.sessionId)
      expect(session().base?.revision).toBe(1)
      expect(names()).toEqual(['P1'])
      const sent = fake.api.publish.mock.calls.length
      await vi.advanceTimersByTimeAsync(1000)
      expect(fake.api.publish.mock.calls.length).toBe(sent)
      stop()
    })

    it('ends the old session on the club before sending the next one started straight after', async () => {
      const fake = fakeApi()
      const stop = await started(fake)
      const first = session().sessionId
      session().endSession()
      session().startSession('Next', 'doubles', 1)
      await vi.advanceTimersByTimeAsync(500)
      expect(fake.api.clear).toHaveBeenCalledWith('tok-1', first)
      expect(fake.server.row?.sessionId).toBe(session().sessionId)
      expect(useSyncStore.getState().otherSession).toBeNull()
      expect(session().endedSessionId).toBe('')
      stop()
    })

    it('keeps unsent changes across a reload', async () => {
      const fake = fakeApi()
      const stop = await started(fake)
      online.value = false
      session().checkInPlayer(player(7))
      const saved = JSON.parse(localStorage.getItem('q2dink-session')!) as { state: { pending: unknown[]; base: unknown } }
      expect(saved.state.pending).toHaveLength(1)
      expect(saved.state.base).not.toBeNull()
      stop()
    })
  })

  it('stops publishing once stopped', async () => {
    const { api, cloudApi } = fakeApi()
    useClubAuth.setState({ club })
    const stop = startCloudSync(cloudApi)
    stop()
    session().startSession('Club', 'doubles', 1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.publish).not.toHaveBeenCalled()
  })
})
