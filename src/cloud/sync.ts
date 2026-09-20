import { toast } from 'sonner'
import { create } from 'zustand'
import { useSessionStore } from '@/store/session'
import { CloudError, type CloudApi } from './api'
import { useClubAuth } from './auth'
import { cloud } from './client'
import { createPublisher, type SyncStatus } from './publisher'
import { toFullBackup, toPublicSnapshot } from './snapshot'

interface SyncStore {
  status: SyncStatus
  setStatus: (status: SyncStatus) => void
}

export const useSyncStore = create<SyncStore>()((set) => ({
  status: 'off',
  setStatus: (status) => set({ status }),
}))

const isExpiredLogin = (error: unknown) => error instanceof CloudError && error.code === 'invalid_token'

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
    isFatal: isExpiredLogin,
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
    } else if (!state.club && prev.club) {
      setStatus('off')
    }
  })

  const handleOnline = () => {
    publisher.onOnline()
    void flushPendingLifetime(api)
  }
  const handleOffline = () => {
    if (signedIn()) setStatus('offline')
  }
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  if (signedIn()) {
    pushIfRunning()
    void flushPendingLifetime(api)
  }

  return () => {
    publisher.dispose()
    unsubscribeSession()
    unsubscribeAuth()
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
