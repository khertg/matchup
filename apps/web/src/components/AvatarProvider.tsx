import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AvatarIndex } from '@q2dink/shared'
import { useClubAuth } from '@/cloud/auth'
import { cloud } from '@/cloud/client'
import type { Player } from '@/db/db'
import { listRoster } from '@/db/roster'
import { getLogoSetting, type LogoSetting } from '@/db/settings'
import { avatarKey, type PlayerAvatar } from '@/lib/avatar'
import { AvatarContext, type AvatarContextValue } from '@/lib/avatars'

/** How often the live page (and a signed-in staff device) checks for changed avatars. */
const REFRESH_MS = 15_000

/**
 * Makes players' avatars and the club logo available to every component. Staff devices read their own
 * roster and, when signed in, the club's; the players' live page (`viewerSlug`) reads only the club's.
 */
export function AvatarProvider({ viewerSlug, children }: { viewerSlug?: string; children: ReactNode }) {
  const club = useClubAuth((s) => s.club)
  const slug = viewerSlug ?? club?.slug ?? null

  const players = useLiveQuery(
    () => (viewerSlug ? Promise.resolve([] as Player[]) : listRoster(club?.slug)),
    [viewerSlug, club?.slug],
  )
  const logo = useLiveQuery(() => (viewerSlug ? Promise.resolve(undefined as LogoSetting | undefined) : getLogoSetting()), [viewerSlug])

  const [remote, setRemote] = useState<{ slug: string; index: AvatarIndex } | null>(null)
  useEffect(() => {
    if (!cloud || !slug) return
    const api = cloud
    let cancelled = false
    async function load() {
      try {
        const index = await api.fetchAvatarIndex(slug!)
        if (!cancelled) setRemote({ slug: slug!, index })
      } catch {
        // Keep whatever was shown before; avatars are never worth an error.
      }
    }
    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)
    const handleOnline = () => void load()
    window.addEventListener('online', handleOnline)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('online', handleOnline)
    }
  }, [slug])

  const value = useMemo<AvatarContextValue>(() => {
    const local = new Map<string, PlayerAvatar>()
    const rosterIds = new Map<string, number>()
    for (const p of players ?? []) {
      if (p.id === undefined) continue
      rosterIds.set(avatarKey(p.name), p.id)
      if (p.avatar) local.set(avatarKey(p.name), p.avatar)
    }
    return {
      local,
      rosterIds,
      club: remote && remote.slug === slug ? remote : null,
      localLogo: logo === undefined ? undefined : logo.data,
    }
  }, [players, remote, slug, logo])

  return <AvatarContext.Provider value={value}>{children}</AvatarContext.Provider>
}

