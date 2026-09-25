import { toast } from 'sonner'
import { create } from 'zustand'
import { db } from '@/db/db'
import { archiveSession, markHistorySynced, unsyncedHistory } from '@/db/history'
import {
  claimUnownedPlayers,
  clearAvatarDirty,
  dirtyRoster,
  listRoster,
  markPhotosDirty,
  markRosterSent,
  mergeClubRoster,
  setClubAvatar,
} from '@/db/roster'
import { MAX_ROSTER_BATCH, type SessionStateRow, type StaffAvatar } from '@q2dink/shared'
import {
  addPendingRename,
  clearPendingRenames,
  getLogoSetting,
  getPendingRenames,
  getPhotoSharingPending,
  getSharePhotos,
  getSyncClub,
  markLogoSynced,
  markPhotosSentFor,
  photosSentFor,
  removePendingRename,
  setPhotoSharingPending,
  setSharePhotos,
  setSyncClub,
} from '@/db/settings'
import { avatarKey, colorFor, dataUrlBase64, type PlayerAvatar } from '@/lib/avatar'
import { useSessionStore } from '@/store/session'
import { CloudError, type CloudApi, type PutAvatarRequest } from './api'
import { useClubAuth } from './auth'
import { cloud } from './client'
import { createPublisher, type SyncStatus } from './publisher'
import { newBatchId } from './id'
import { parseFullBackup, toFullBackup, toHistoryBackup, toPublicSnapshot } from './snapshot'

interface SyncStore {
  status: SyncStatus
  setStatus: (status: SyncStatus) => void
  /** The session the club has running (from any staff device), or null. What "Join" offers. */
  clubSession: SessionStateRow | null
  /**
   * The club is running a different session from this device's (another device started one): this
   * device stops sending until staff choose to join it or to keep their own.
   */
  otherSession: SessionStateRow | null
  /** Staff chose to keep this device's session over the other one: the next send replaces it. */
  keepMine: boolean
}

export const useSyncStore = create<SyncStore>()((set) => ({
  status: 'off',
  setStatus: (status) => set({ status }),
  clubSession: null,
  otherSession: null,
  keepMine: false,
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
    // The photo switch belongs to the earlier club; this club's own setting arrives with the next sync.
    await setPhotoSharingPending(false)
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
    if (useClubAuth.getState().club?.slug !== club.slug) return false
    await mergeClubRoster(club.slug, players)
    await pullAvatars(api, club)
    return true
  } catch (error) {
    handleAuthError(error)
    return false
  }
}

const ROSTER_SYNC_DELAY_MS = 1000
const ROSTER_POLL_MS = 30_000
/** How often a staff device checks the club's copy of the session, in case the live stream dropped. */
const SESSION_POLL_MS = 15_000
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

/** A club avatar as this device keeps it on a saved player. */
function toPlayerAvatar(avatar: StaffAvatar, name: string): PlayerAvatar | null {
  if (avatar.kind === 'photo') return avatar.photo ? { kind: 'photo', data: `data:${avatar.photo.type};base64,${avatar.photo.data}` } : null
  if (avatar.kind === 'emoji') return avatar.emoji ? { kind: 'emoji', value: avatar.emoji, color: avatar.color ?? colorFor(name) } : null
  return { kind: 'initials', color: avatar.color ?? colorFor(name) }
}

/**
 * Bring in the avatars the club's other staff devices set, photos included, so every device of the
 * club shows the same faces. Each saved player whose avatar did not change here takes the club's when
 * the club's version differs from the one it has, and loses one that had come from the club when the
 * club no longer has it. Also takes the club's photo switch, unless it was just changed here.
 */
async function pullAvatars(api: CloudApi, club: { slug: string; token: string }): Promise<void> {
  const index = await api.fetchStaffAvatars(club.token)
  if (!(await getPhotoSharingPending())) await setSharePhotos(index.sharePhotos)
  for (const player of await listRoster(club.slug)) {
    if (player.avatarDirty) continue
    const shared = index.avatars[avatarKey(player.name)]
    if (!shared) {
      if (player.avatarVersion !== undefined) await setClubAvatar(player.id, null)
      continue
    }
    if (player.avatarVersion === shared.v) continue
    const avatar = await api.fetchStaffAvatar(club.token, avatarKey(player.name))
    if (useClubAuth.getState().club?.slug !== club.slug) return
    const local = avatar && toPlayerAvatar(avatar, player.name)
    if (local) await setClubAvatar(player.id, local, avatar.v)
  }
}

/** What the club is sent for an avatar. */
function avatarRequest(avatar: PlayerAvatar): PutAvatarRequest {
  if (avatar.kind === 'photo') return { kind: 'photo', photo: { data: dataUrlBase64(avatar.data) } }
  if (avatar.kind === 'emoji') return { kind: 'emoji', emoji: avatar.value, color: avatar.color }
  return { kind: 'initials', color: avatar.color }
}

/**
 * Send the club logo, player avatars (photos too: the club's other staff devices use them) and the
 * photo switch that changed on this device. Whether the public live page shows the photos is the
 * club's switch, not a reason to keep them here. Safe to call repeatedly. Returns true when nothing is
 * left waiting.
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
    if (await getPhotoSharingPending()) {
      await api.putPhotoSharing(club.token, await getSharePhotos())
      await setPhotoSharingPending(false)
    }
    // Photos set while they only went to the club with sharing on are sent once now.
    if (!(await photosSentFor(club.slug))) {
      await markPhotosDirty(club.slug)
      await markPhotosSentFor(club.slug)
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
      await attempt(() => (sent ? api.putAvatar(club.token, key, avatarRequest(sent)) : api.deleteAvatar(club.token, key)))
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
 * Turn showing player photos on the club's public live page on or off, for the whole club (now, or as
 * soon as it is reachable). The photos stay with the club's staff devices either way.
 */
export async function setPhotoSharing(on: boolean, api: CloudApi | null = cloud): Promise<void> {
  await setSharePhotos(on)
  await setPhotoSharingPending(true)
  await syncMedia(api)
}

/**
 * Publishes the running session to the club's live viewer page while staff are
 * signed in to a club. Returns a function that stops syncing.
 */
/** Say which of this device's changes another staff device's got there first for. */
function reportDropped(dropped: { reason: string }[]) {
  for (const { reason } of dropped) toast.warning(`Not applied, changed on another device: ${reason}`)
}

/**
 * The club's copy of the session, as another staff device left it (or null when none is running).
 * With this device running the same session, take it and apply this device's unsent changes on top;
 * with none running here, remember it so staff can join; with a different one running here, say so.
 */
export async function adoptClubCopy(clubRow: SessionStateRow | null): Promise<void> {
  const sync = useSyncStore.getState()
  const store = useSessionStore.getState()
  // A session that ended here but whose end has not reached the club yet is not running.
  const row = clubRow && clubRow.sessionId !== null && clubRow.sessionId === store.endedSessionId ? null : clubRow
  useSyncStore.setState({ clubSession: row })
  if (!store.session) {
    useSyncStore.setState({ otherSession: null })
    return
  }
  // Not shared yet (just started, or never sent): the first send decides.
  if (!store.base) return
  if (!row) {
    // It ended on another device, after this one had it: follow, keeping a copy here.
    if (store.base.revision > 0) await endedElsewhere()
    return
  }
  const sameSession = row.sessionId === null || row.sessionId === store.sessionId
  if (!sameSession) {
    if (!sync.keepMine) useSyncStore.setState({ otherSession: row })
    return
  }
  useSyncStore.setState({ otherSession: null })
  if (row.revision <= store.base.revision) return
  const parsed = parseFullBackup(row.full)
  if (!parsed) return
  reportDropped(useSessionStore.getState().rebaseOnto(row.revision, parsed.session, parsed.location))
}

/** Another staff device ended the session: keep it in Past sessions here, and leave it. */
async function endedElsewhere(): Promise<void> {
  const store = useSessionStore.getState()
  if (!store.session) return
  const club = useClubAuth.getState().club
  const unsent = store.pending.length
  try {
    const saved = await archiveSession({
      id: store.sessionId,
      location: store.location,
      startedAt: store.startedAt,
      session: store.session,
      lifetimeCounted: store.lifetimeCounted,
      clubSlug: club?.slug,
    })
    // The device that ended it sends the club its copy; this one only keeps its own.
    if (saved) await markHistorySynced(saved.id, club?.slug)
  } catch {
    // Keeping a local copy is a courtesy; leaving the session is what matters.
  }
  useSessionStore.getState().endSession()
  toast(
    `“${store.location}” was ended on another device` +
      (unsent > 0 ? `. ${unsent === 1 ? '1 change' : `${unsent} changes`} made here had not been sent.` : ''),
  )
}

/** Join the session the club has running, alongside the device that started it. */
export function joinClubSession(row: SessionStateRow): boolean {
  const parsed = parseFullBackup(row.full)
  if (!parsed) return false
  useSessionStore.getState().joinShared(
    parsed.location,
    parsed.session,
    {
      sessionId: row.sessionId ?? newBatchId(),
      startedAt: row.startedAt ? Date.parse(row.startedAt) : Date.now(),
      lifetimeCounted: parsed.lifetimeCounted,
    },
    row.revision,
  )
  useSyncStore.setState({ otherSession: null, keepMine: false })
  return true
}

/** Keep running this device's session: the next send replaces the other device's on the club. */
export function keepMySession(): void {
  useSyncStore.setState({ otherSession: null, keepMine: true })
  // Sending again is what makes it stick; any change triggers it, so poke the store.
  useSessionStore.setState((s) => ({ session: s.session && { ...s.session } }))
}

export function startCloudSync(api: CloudApi | null = cloud): () => void {
  if (!api) return () => {}

  const signedIn = () => useClubAuth.getState().club
  const setStatus = (status: SyncStatus) => useSyncStore.getState().setStatus(status)
  setStatus(signedIn() ? 'idle' : 'off')

  // Sends and fetches of the shared session never overlap, so a fetched copy is never mixed up with a
  // send still on its way.
  let queue: Promise<unknown> = Promise.resolve()
  const serially = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }
  /**
   * Tell the club a session that ended here has ended, if it has not been told yet (only that one, so a
   * newer session another device started is never ended).
   */
  const sendEnd = async (token: string) => {
    const ended = useSessionStore.getState().endedSessionId
    if (!ended) return
    await api.clear(token, ended)
    useSessionStore.setState((s) => (s.endedSessionId === ended ? { endedSessionId: '' } : {}))
  }

  const publisher = createPublisher({
    publish: () =>
      serially(async () => {
        const club = signedIn()
        if (!club) return
        useSessionStore.getState().shareSession()
        const { base, pending, session, location, locationPending, sessionId, startedAt } = useSessionStore.getState()
        if (!session || !base) return
        // A session that ended here just before this one began (or before a reload): its end may never
        // have been sent, so end it on the club first, or this one would look like a clash with it.
        try {
          await sendEnd(club.token)
        } catch (error) {
          handleAuthError(error)
          throw error
        }
        const { otherSession, keepMine } = useSyncStore.getState()
        // Waiting for staff to choose between this session and another device's.
        if (otherSession) return
        // Nothing new here (the change came from another device): nothing to send. A rename alone is new.
        if (pending.length === 0 && !locationPending && base.revision > 0 && !keepMine) return
        try {
          const outcome = await api.publish(
            club.token,
            toPublicSnapshot(location, session),
            toFullBackup(location, session),
            {
              ...(keepMine ? {} : { baseRevision: base.revision }),
              sessionId,
              startedAt: new Date(startedAt).toISOString(),
            },
          )
          if ('revision' in outcome) {
            useSessionStore.getState().confirmPublished(pending.length, session, outcome.revision, location)
            useSyncStore.setState({ keepMine: false })
          } else {
            // Moved on elsewhere: take the club's copy, apply this device's changes on top, send again.
            await adoptClubCopy(outcome.conflict)
          }
        } catch (error) {
          handleAuthError(error)
          throw error
        }
      }),
    clear: async () => {
      const club = signedIn()
      if (!club) return
      try {
        await sendEnd(club.token)
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
    const { location, session, endedSessionId } = useSessionStore.getState()
    if (session) publisher.push(location, session)
    // A session ended here, and the app closed before the club was told: tell it now.
    else if (endedSessionId) publisher.push(location, null)
  }

  const unsubscribeSession = useSessionStore.subscribe((state, prev) => {
    if (!signedIn()) return
    if (state.session !== prev.session || state.location !== prev.location) {
      publisher.push(state.location, state.session)
    }
  })

  // Follow the club's copy: the live board's stream says when it changed; the private copy is then
  // fetched with the staff login. A poll covers a stream that dropped.
  const refresh = () =>
    serially(async () => {
      const club = signedIn()
      if (!club || !navigator.onLine) return
      try {
        const row = await api.fetchSessionState(club.token)
        if (signedIn()?.slug === club.slug) await adoptClubCopy(row)
      } catch (error) {
        handleAuthError(error)
      }
    })
  let unsubscribeLive: () => void = () => {}
  const follow = () => {
    unsubscribeLive()
    unsubscribeLive = () => {}
    const club = signedIn()
    if (!club) return
    unsubscribeLive = api.subscribeLive(club.slug, (row) => {
      const base = useSessionStore.getState().base
      if (row && base && row.revision !== undefined && row.revision <= base.revision) return
      void refresh()
    })
    void refresh()
  }

  const unsubscribeAuth = useClubAuth.subscribe((state, prev) => {
    if (state.club && !prev.club) {
      setStatus('idle')
      pushIfRunning()
      follow()
      void runSync(api)
    } else if (!state.club && prev.club) {
      setStatus('off')
      unsubscribeLive()
      unsubscribeLive = () => {}
      useSyncStore.setState({ clubSession: null, otherSession: null, keepMine: false })
    }
  })

  const handleOnline = () => {
    void checkLogin(api)
    publisher.onOnline()
    void refresh()
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
  const sessionPoll = setInterval(() => void refresh(), SESSION_POLL_MS)

  if (signedIn()) {
    void checkLogin(api)
    pushIfRunning()
    follow()
    void runSync(api)
  }

  return () => {
    publisher.dispose()
    unsubscribeSession()
    unsubscribeAuth()
    unsubscribeLive()
    clearInterval(sessionPoll)
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    clearInterval(rosterPoll)
  }
}
