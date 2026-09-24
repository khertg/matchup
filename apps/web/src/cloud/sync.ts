import { toast } from 'sonner'
import { create } from 'zustand'
import { db } from '@/db/db'
import { markHistorySynced, unsyncedHistory } from '@/db/history'
import {
  claimUnownedPlayers,
  clearAvatarDirty,
  dirtyRoster,
  markPhotosDirty,
  markRosterSent,
  mergeClubRoster,
} from '@/db/roster'
import { MAX_ROSTER_BATCH } from '@q2dink/shared'
import {
  addPendingRename,
  clearPendingRenames,
  getLogoSetting,
  getPendingRenames,
  getPhotoPurgePending,
  getSharePhotos,
  getSyncClub,
  markLogoSynced,
  removePendingRename,
  setPhotoPurgePending,
  setSharePhotos,
  setSyncClub,
} from '@/db/settings'
import { avatarKey, dataUrlBase64, type PlayerAvatar } from '@/lib/avatar'
import { useSessionStore } from '@/store/session'
import { CloudError, type CloudApi, type PutAvatarRequest } from './api'
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
 * Ask the server whether the saved login still works, so an expired one puts the device on the
 * login screen at launch instead of failing quietly later. Being offline, or a server error, leaves
 * the device logged in: the app is meant to keep working with no signal.
 */
export async function checkLogin(api: CloudApi | null = cloud): Promise<void> {
  const club = useClubAuth.getState().club
  if (!api || !club) return
  try {
    await api.fetchFullSession(club.token)
  } catch (error) {
    // Ignore an answer about a login that has been replaced while this was in flight.
    if (useClubAuth.getState().club?.token === club.token) handleAuthError(error)
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
    for (const record of await unsyncedHistory(club.slug)) {
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
      await markHistorySynced(record.id, club.slug)
    }
    return true
  } catch (error) {
    handleAuthError(error)
    return false
  }
}

/**
 * Make sure the logo and avatar changes waiting on this device are for the club that is logged in.
 * The first club to log in takes them. If a different club logs in later, the earlier club's unsent
 * logo and avatar changes are dropped (never sent to the new club), and photo sharing goes back to off,
 * which is the private default for a club that has not chosen it. Sessions are tagged with their club
 * and the leaderboard totals with their slug, so those already stay with the right club.
 * Safe to call repeatedly.
 */
export async function adoptClub(slug: string): Promise<void> {
  // Saved players no club has taken yet (from before rosters were shared) belong to the first club to sync.
  await claimUnownedPlayers(slug)
  const previous = await getSyncClub()
  if (previous === slug) return
  if (previous !== undefined) {
    await clearAvatarDirty()
    await clearPendingRenames()
    await markLogoSynced()
    await setPhotoPurgePending(false)
    await setSharePhotos(false)
  }
  await setSyncClub(slug)
}

/** A rename the club will never accept (a name it refuses) is dropped: retrying cannot help. */
const isRenameRefused = (error: unknown) =>
  isPermanent(error) || (error instanceof CloudError && error.code === 'invalid_request')

/**
 * Tell the club about players renamed on this device, in the order they were renamed, so their
 * leaderboard row and shared avatar move to the new name. Safe to call repeatedly (the club treats
 * a repeat as nothing to do). Returns true when nothing is left waiting.
 */
export async function flushRenames(api: CloudApi | null = cloud): Promise<boolean> {
  const club = useClubAuth.getState().club
  if (!api || !club) return false
  try {
    await adoptClub(club.slug)
    for (const rename of await getPendingRenames()) {
      try {
        await api.renamePlayer(club.token, rename.from, rename.to)
      } catch (error) {
        if (!isRenameRefused(error) || isExpiredLogin(error)) throw error
      }
      await removePendingRename(rename)
    }
    return true
  } catch (error) {
    handleAuthError(error)
    return false
  }
}

/**
 * A player was renamed on this device: remember to move the club's copy of them, and make sure
 * totals still waiting to upload use the new name. Does nothing when there is no cloud.
 */
export async function queueClubRename(from: string, to: string, api: CloudApi | null = cloud): Promise<void> {
  if (!api || from === to) return
  useClubAuth.getState().renamePendingLifetime(from, to)
  await addPendingRename({ from, to })
  void runSync(api)
}

/**
 * One pass over everything waiting to reach the club. Renames go first, so a name that changed is
 * never uploaded under its old spelling by the passes that follow.
 */
async function runSync(api: CloudApi): Promise<void> {
  const renamed = await flushRenames(api)
  await Promise.all([
    flushPendingLifetime(api),
    syncHistory(api),
    syncMedia(api),
    renamed ? exchangeRoster(api) : Promise.resolve(false),
  ])
}

/**
 * Share the club's saved players between its staff devices: send the ones added or changed here, then
 * bring in the ones other devices added or changed. Renames go first, so a renamed player is never
 * brought back under the old name. Safe to call repeatedly. Returns true when everything went through.
 */
export async function syncRoster(api: CloudApi | null = cloud): Promise<boolean> {
  if (!api || !(await flushRenames(api))) return false
  return exchangeRoster(api)
}

/** The roster part of syncRoster, once renames are through. */
async function exchangeRoster(api: CloudApi): Promise<boolean> {
  const club = useClubAuth.getState().club
  if (!club) return false
  try {
    const dirty = await dirtyRoster(club.slug)
    for (let i = 0; i < dirty.length; i += MAX_ROSTER_BATCH) {
      const batch = dirty.slice(i, i + MAX_ROSTER_BATCH)
      await api.putRoster(
        club.token,
        batch.map((p) => ({ name: p.name, skill: p.skill, ...(p.gender ? { gender: p.gender } : {}) })),
      )
      await markRosterSent(batch)
    }
    // The club may have changed while this ran (another club logged in): never file its players under this one.
    const players = await api.fetchRoster(club.token)
    if (useClubAuth.getState().club?.slug === club.slug) await mergeClubRoster(club.slug, players)
    return true
  } catch (error) {
    handleAuthError(error)
    return false
  }
}

const ROSTER_SYNC_DELAY_MS = 1000
const ROSTER_POLL_MS = 30_000
let rosterSyncTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Sync the roster soon: after a player was added or changed here (a burst of check-ins goes up as one
 * request), or when check-in opens. Does nothing with no cloud or no club.
 */
export function requestRosterSync(api: CloudApi | null = cloud): void {
  if (!api || !useClubAuth.getState().club) return
  clearTimeout(rosterSyncTimer)
  rosterSyncTimer = setTimeout(() => void syncRoster(api), ROSTER_SYNC_DELAY_MS)
}

/** What the club is sent for an avatar: emoji and initials always, a photo only while photos are shared. */
function avatarRequest(avatar: PlayerAvatar): PutAvatarRequest {
  if (avatar.kind === 'photo') return { kind: 'photo', photo: { data: dataUrlBase64(avatar.data) } }
  if (avatar.kind === 'emoji') return { kind: 'emoji', emoji: avatar.value, color: avatar.color }
  return { kind: 'initials', color: avatar.color }
}

/**
 * Send the club logo and player avatars that changed on this device. Emoji and initials avatars and
 * the logo always go; photos go only while photo sharing is on (otherwise the club's copy is removed).
 * Safe to call repeatedly. Returns true when nothing is left waiting.
 */
export async function syncMedia(api: CloudApi | null = cloud): Promise<boolean> {
  const club = useClubAuth.getState().club
  if (!api || !club) return false
  // A request the server will never accept is dropped: retrying cannot help.
  const attempt = async (send: () => Promise<void>) => {
    try {
      await send()
    } catch (error) {
      if (!isPermanent(error) || isExpiredLogin(error)) throw error
    }
  }
  try {
    // Inside the try: if the device's storage cannot be read this is a failed sync, never a rejection
    // that nobody handles (callers do `void syncMedia()`).
    await adoptClub(club.slug)
    const share = await getSharePhotos()
    if (!share && (await getPhotoPurgePending())) {
      await api.deleteAvatarPhotos(club.token)
      await setPhotoPurgePending(false)
    }

    const logo = await getLogoSetting()
    if (logo?.dirty) {
      await attempt(() => (logo.data ? api.putLogo(club.token, dataUrlBase64(logo.data)) : api.deleteLogo(club.token)))
      await markLogoSynced()
    }

    for (const player of await db.players
      .filter((p) => p.avatarDirty === true && p.clubSlug === club.slug)
      .toArray()) {
      const key = avatarKey(player.name)
      const sent = player.avatar
      await attempt(() =>
        !sent || (sent.kind === 'photo' && !share)
          ? api.deleteAvatar(club.token, key)
          : api.putAvatar(club.token, key, avatarRequest(sent)),
      )
      // Only forget the change if it was not changed again while it was being sent.
      const now = await db.players.get(player.id!)
      if (JSON.stringify(now?.avatar) === JSON.stringify(sent)) await db.players.update(player.id!, { avatarDirty: false })
    }
    return true
  } catch (error) {
    handleAuthError(error)
    return false
  }
}

/**
 * Turn sharing of player photos on the public live page on or off. Off takes every photo down from the
 * club (now, or as soon as it is reachable); on sends the photos on this device.
 */
export async function setPhotoSharing(on: boolean, api: CloudApi | null = cloud): Promise<void> {
  await setSharePhotos(on)
  if (on) {
    await setPhotoPurgePending(false)
    await markPhotosDirty()
  } else {
    await setPhotoPurgePending(true)
  }
  await syncMedia(api)
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
      void runSync(api)
    } else if (!state.club && prev.club) {
      setStatus('off')
    }
  })

  const handleOnline = () => {
    void checkLogin(api)
    publisher.onOnline()
    void runSync(api)
  }
  const handleOffline = () => {
    if (signedIn()) setStatus('offline')
  }
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  // Players added on the club's other devices show up here within about this long.
  const rosterPoll = setInterval(() => {
    if (signedIn() && navigator.onLine) void syncRoster(api)
  }, ROSTER_POLL_MS)

  if (signedIn()) {
    void checkLogin(api)
    pushIfRunning()
    void runSync(api)
  }

  return () => {
    publisher.dispose()
    unsubscribeSession()
    unsubscribeAuth()
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    clearInterval(rosterPoll)
  }
}
