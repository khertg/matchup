import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { avatarKey } from '@q2dink/shared'
import type { LifetimePlayer } from './api'

export interface Club {
  slug: string
  name: string
  /** Opaque staff token from club_login; the password is never kept. */
  token: string
}

/** A finished session's totals waiting to reach the club leaderboard. */
export interface PendingLifetime {
  batchId: string
  slug: string
  players: LifetimePlayer[]
}

interface ClubAuthStore {
  club: Club | null
  pendingLifetime: PendingLifetime[]
  signIn: (club: Club) => void
  signOut: () => void
  /** The club was renamed, here or on another staff device. */
  setClubName: (name: string) => void
  enqueueLifetime: (pending: PendingLifetime) => void
  dequeueLifetime: (batchId: string) => void
  /** A player was renamed: totals still waiting to upload must carry the new name, or they would recreate the old one. */
  renamePendingLifetime: (from: string, to: string) => void
}

export const useClubAuth = create<ClubAuthStore>()(
  persist(
    (set) => ({
      club: null,
      pendingLifetime: [],
      signIn: (club) => set({ club }),
      signOut: () => set({ club: null }),
      setClubName: (name) => set((s) => (s.club && s.club.name !== name ? { club: { ...s.club, name } } : {})),
      enqueueLifetime: (pending) =>
        set((s) => ({ pendingLifetime: [...s.pendingLifetime, pending] })),
      dequeueLifetime: (batchId) =>
        set((s) => ({ pendingLifetime: s.pendingLifetime.filter((p) => p.batchId !== batchId) })),
      renamePendingLifetime: (from, to) =>
        set((s) => ({
          pendingLifetime: s.pendingLifetime.map((batch) => ({
            ...batch,
            players: batch.players.map((p) => (avatarKey(p.name) === avatarKey(from) ? { ...p, name: to } : p)),
          })),
        })),
    }),
    {
      name: 'q2dink-club',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
