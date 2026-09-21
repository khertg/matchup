import { create } from 'zustand'

interface RecoveryStore {
  /** A club's one-time recovery code waiting to be shown, or null. Never persisted. */
  code: string | null
  show: (code: string) => void
  clear: () => void
}

/**
 * Creating a club or resetting a password signs the person in at once, which changes the screen
 * under the dialog that made the code. The code lives here so it survives that and is shown once.
 */
export const useRecoveryCode = create<RecoveryStore>()((set) => ({
  code: null,
  show: (code) => set({ code }),
  clear: () => set({ code: null }),
}))
