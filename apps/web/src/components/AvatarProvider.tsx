import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AvatarIndex } from '@matchup/shared'
import { useClubAuth } from '@/cloud/auth'
import { cloud } from '@/cloud/client'
import { db, type Player } from '@/db/db'
import { getLogoSetting, type LogoSetting } from '@/db/settings'
import type { PlayerAvatar } from '@/lib/avatar'
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

  const players = useLiveQuery(() => (viewerSlug ? Promise.resolve([] as Player[]) : db.players.toArray()), [viewerSlug])
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
    const local = new Map<number, PlayerAvatar>()
    for (const p of players ?? []) if (p.id !== undefined && p.avatar) local.set(p.id, p.avatar)
    return {
      local,
      club: remote && remote.slug === slug ? remote : null,
      localLogo: logo === undefined ? undefined : logo.data,
    }
  }, [players, remote, slug, logo])

  return <AvatarContext.Provider value={value}>{children}</AvatarContext.Provider>
}

