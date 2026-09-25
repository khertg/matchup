import { createContext, useContext } from 'react'
import type { AvatarIndex } from '@q2dink/shared'
import { cloud } from '@/cloud/client'
import { avatarKey, colorFor, initialsOf, type PlayerAvatar } from './avatar'

/** How a player is drawn, whichever place the avatar came from. */
export type ResolvedAvatar =
  | { kind: 'photo'; src: string }
  | { kind: 'emoji'; value: string; color: string }
  | { kind: 'initials'; text: string; color: string }

export interface AvatarContextValue {
  /**
   * This device's roster avatars for the signed-in club, by lower-case name (a session's player ids are
   * the session's own, shared by every staff device, never this device's roster ids). Empty on the live page.
   */
  local: Map<string, PlayerAvatar>
  /** This device's saved players of the club, by lower-case name: their roster id, for changing an avatar. */
  rosterIds?: Map<string, number>
  /** The club's avatars by lower-case name and its logo version, or null with no club. */
  club: { slug: string; index: AvatarIndex } | null
  /** This device's logo: undefined = none set here, null = removed here, else a data URL. */
  localLogo: string | null | undefined
  /** The signed-in club's name on a staff device (known offline, and at once after a rename here). */
  clubName?: string | null
}

export const AvatarContext = createContext<AvatarContextValue>({ local: new Map(), club: null, localLogo: undefined })

/** Where the club's images are, when there is a cloud. */
export interface MediaUrls {
  photo: (slug: string, key: string, version: number) => string
  logo: (slug: string, version: number) => string
}

const api = cloud
const cloudUrls: MediaUrls | null = api && {
  photo: (slug, key, v) => api.avatarPhotoUrl(slug, key, v),
  logo: (slug, v) => api.logoUrl(slug, v),
}

/**
 * The avatar to draw for a player: this device's saved avatar for that name, else the club's, else the
 * automatic initials on a colour taken from the name.
 */
export function resolveAvatar(
  { local, club }: Pick<AvatarContextValue, 'local' | 'club'>,
  name: string,
  urls: MediaUrls | null = cloudUrls,
): ResolvedAvatar {
  const own = local.get(avatarKey(name))
  if (own) {
    if (own.kind === 'photo') return { kind: 'photo', src: own.data }
    if (own.kind === 'emoji') return { kind: 'emoji', value: own.value, color: own.color }
    return { kind: 'initials', text: initialsOf(name), color: own.color }
  }
  const key = avatarKey(name)
  const shared = club?.index.avatars[key]
  if (shared && urls && club) {
    if (shared.kind === 'photo') return { kind: 'photo', src: urls.photo(club.slug, key, shared.v) }
    if (shared.kind === 'emoji' && shared.emoji) {
      return { kind: 'emoji', value: shared.emoji, color: shared.color ?? colorFor(name) }
    }
    if (shared.kind === 'initials') {
      return { kind: 'initials', text: initialsOf(name), color: shared.color ?? colorFor(name) }
    }
  }
  return { kind: 'initials', text: initialsOf(name), color: colorFor(name) }
}

/** The club logo to show: this device's, else the club's, else nothing. */
export function resolveLogo(
  { localLogo, club }: Pick<AvatarContextValue, 'localLogo' | 'club'>,
  urls: MediaUrls | null = cloudUrls,
): string | null {
  if (localLogo !== undefined) return localLogo
  if (club && urls && club.index.logo) return urls.logo(club.slug, club.index.logo.v)
  return null
}

export function usePlayerAvatar(name: string): ResolvedAvatar {
  return resolveAvatar(useContext(AvatarContext), name)
}

/** This device's own avatar for a player, for the editor to start from. Null when none is set. */
export function useOwnAvatar(name: string): PlayerAvatar | null {
  return useContext(AvatarContext).local.get(avatarKey(name)) ?? null
}

/** This device's saved player of that name (its roster id), or undefined when it has none. */
export function useRosterId(name: string): number | undefined {
  return useContext(AvatarContext).rosterIds?.get(avatarKey(name))
}

export function useClubLogo(): string | null {
  return resolveLogo(useContext(AvatarContext))
}

/** The signed-in (or viewed) club's display name, else null. */
export function useClubName(): string | null {
  const { clubName, club } = useContext(AvatarContext)
  return clubName ?? club?.index.name ?? null
}

/** A session's name with its club in front, "Club - Session", or the session name alone with no club. */
export function useSessionTitle(sessionName: string): string {
  const clubName = useClubName()
  return clubName ? `${clubName} - ${sessionName}` : sessionName
}
