import { toast } from 'sonner'
import { create } from 'zustand'
import { markHistorySynced, unsyncedHistory } from '@/db/history'
import { useSessionStore } from '@/store/session'
import { CloudError, type CloudApi } from './api'
import { useClubAuth } from './auth'
import { cloud } from './client'
import { createPublisher, type SyncStatus } from './publisher'
import { toFullBackup, toHistoryBackup, toPublicSnapshot } from './snapshot'

interface SyncStore {
  status: SyncStatus
  setStatus: (status: SyncStatus) => void
}

export const useSyncStore = create<SyncStore>()((set) => ({
  status: 'off',
  setStatus: (status) => set({ status }),
}))

const isExpiredLogin = (error: unknown) => error instanceof CloudError && error.code === 'invalid_token'

/** Errors that retrying cannot fix: the login is gone, or the server refuses this session's data. */
const isPermanent = (error: unknown) =>
  error instanceof CloudError &&
  (error.code === 'invalid_token' || error.code === 'invalid_snapshot' || error.code === 'payload_too_large')

/** An expired staff token means signing out; anything else is left for a retry. */
function handleAuthError(error: unknown) {
  if (isExpiredLogin(error)) {
    useClubAuth.getState().signOut()
    toast.error('Your club login expired. Please log in again.')
  }
}

/**
 * Send finished-session totals that are waiting for the club leaderboard.
 * Safe to call repeatedly: the server applies each batch only once.
 * Returns true when nothing is left waiting for the signed-in club.
 */
export async function flushPendingLifetime(api: CloudApi | null = cloud): Promise<boolean> {
  const { club, pendingLifetime, dequeueLifetime } = useClubAuth.getState()
  if (!api || !club) return false
  for (const item of pendingLifetime.filter((p) => p.slug === club.slug)) {
    try {
      await api.recordLifetime(club.token, item.batchId, item.players)
      dequeueLifetime(item.batchId)
    } catch (error) {
      handleAuthError(error)
      return false
    }
  }
  return true
}

/**
 * Send ended sessions that are not in the club's history yet. Safe to call repeatedly: a session
 * is stored by its id, so sending it twice changes nothing. Returns true when nothing is left waiting.
 */
export async function syncHistory(api: CloudApi | null = cloud): Promise<boolean> {
  const club = useClubAuth.getState().club
  if (!api || !club) return false
  try {
    for (const record of await unsyncedHistory()) {
      try {
        await api.putHistory(
          club.token,
          record.id,
          {
            endedAt: new Date(record.endedAt).toISOString(),
            mode: record.mode,
            players: record.players,
            games: record.games,
          },
          toHistoryBackup(record.location, record.session, record.storeVersion, record.lifetimeCounted),
        )
      } catch (error) {
        // A session the server will never accept stays on this device only; retrying cannot help.
        if (!isPermanent(error) || isExpiredLogin(error)) throw error
      }
      await markHistorySynced(record.id)
    }
    return true
  } catch (error) {
    handleAuthError(error)
    return false
  }
}

/**
 * Publishes the running session to the club's live viewer page while staff are
 * signed in to a club. Returns a function that stops syncing.
 */
export function startCloudSync(api: CloudApi | null = cloud): () => void {
  if (!api) return () => {}

  const signedIn = () => useClubAuth.getState().club
  const setStatus = (status: SyncStatus) => useSyncStore.getState().setStatus(status)
  setStatus(signedIn() ? 'idle' : 'off')

  const publisher = createPublisher({
    publish: async (location, session) => {
      const club = signedIn()
      if (!club) return
      try {
        await api.publish(club.token, toPublicSnapshot(location, session), toFullBackup(location, session))
      } catch (error) {
        handleAuthError(error)
        throw error
      }
    },
    clear: async () => {
      const club = signedIn()
      if (!club) return
      try {
        await api.clear(club.token)
      } catch (error) {
        handleAuthError(error)
        throw error
      }
    },
    isOnline: () => navigator.onLine,
    setStatus: (status) => {
      if (signedIn()) setStatus(status)
    },
    isFatal: isPermanent,
  })

  // Only publish a session that exists. Sending "no session" on start-up would
  // wipe a session another staff device is running.
  const pushIfRunning = () => {
    const { location, session } = useSessionStore.getState()
    if (session) publisher.push(location, session)
  }

  const unsubscribeSession = useSessionStore.subscribe((state, prev) => {
    if (!signedIn()) return
    if (state.session !== prev.session || state.location !== prev.location) {
      publisher.push(state.location, state.session)
    }
  })

  const unsubscribeAuth = useClubAuth.subscribe((state, prev) => {
    if (state.club && !prev.club) {
      setStatus('idle')
      pushIfRunning()
      void flushPendingLifetime(api)
      void syncHistory(api)
    } else if (!state.club && prev.club) {
      setStatus('off')
    }
  })

  const handleOnline = () => {
    publisher.onOnline()
    void flushPendingLifetime(api)
    void syncHistory(api)
  }
  const handleOffline = () => {
    if (signedIn()) setStatus('offline')
  }
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  if (signedIn()) {
    pushIfRunning()
    void flushPendingLifetime(api)
    void syncHistory(api)
  }

  return () => {
    publisher.dispose()
    unsubscribeSession()
    unsubscribeAuth()
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
