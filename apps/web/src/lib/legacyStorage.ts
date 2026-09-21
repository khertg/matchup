/**
 * The app used to be called Matchup, and kept a running session and the staff login in localStorage
 * under `matchup-...` keys. It is now Q2Dink (`q2dink-...`). This copies the old values across on the
 * first launch after the rename, so a session in progress and the club login survive it.
 *
 * This file is the one place the old names may still appear.
 */

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** [the key before the rename, the key now]. */
export const LEGACY_STORAGE_KEYS: readonly (readonly [string, string])[] = [
  ['matchup-session', 'q2dink-session'],
  ['matchup-club', 'q2dink-club'],
]

function browserStorage(): Store | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined // storage blocked
  }
}

/**
 * Move each old value to its new key, but only where the new key is empty (a device that already
 * used the new app keeps what it has), and remove the old key only after the copy worked. Never
 * throws: if storage cannot be used the app just starts fresh.
 */
export function migrateLegacyStorage(storage: Store | undefined = browserStorage()): void {
  if (!storage) return
  for (const [oldKey, newKey] of LEGACY_STORAGE_KEYS) {
    try {
      const value = storage.getItem(oldKey)
      if (value === null || storage.getItem(newKey) !== null) continue
      storage.setItem(newKey, value)
      storage.removeItem(oldKey)
    } catch {
      // Full or blocked storage: leave the old value where it is.
    }
  }
}
