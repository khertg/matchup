/**
 * Offering to install the app, so staff open it with one tap instead of finding a browser tab.
 * Chrome, Edge and Android fire `beforeinstallprompt`, which is kept here and replayed from the
 * banner's Install button. iPhone and iPad have no such event: they can only be told how to do it.
 */
import { create } from 'zustand'

/** Chrome's install event (not in the TypeScript DOM types). */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'q2dink-install-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Private windows can refuse storage; the banner then only stays hidden until the next reload.
  }
}

/** True when running as an installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || !!window.matchMedia?.('(display-mode: standalone)').matches
}

/** iPhone, iPod or iPad. iPadOS reports itself as a Mac, so a "Mac" with a touch screen counts too. */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

interface InstallStore {
  /** Chrome's saved install event, or null when the browser has not offered one. */
  promptEvent: InstallPromptEvent | null
  /** Installed during this visit (the page itself stays a browser tab until reopened). */
  installed: boolean
  /** Staff closed the banner on this device. */
  dismissed: boolean
  install: () => Promise<void>
  dismiss: () => void
}

export const useInstall = create<InstallStore>()((set, get) => ({
  promptEvent: null,
  installed: false,
  dismissed: readDismissed(),
  install: async () => {
    const event = get().promptEvent
    if (!event) return
    // The event can only be used once, whatever the answer.
    set({ promptEvent: null })
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') set({ installed: true })
  },
  dismiss: () => {
    writeDismissed()
    set({ dismissed: true })
  },
}))

/** Listen for the browser's install events. Called before React mounts, since the event can come early. */
export function listenForInstall() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own mini-infobar away; the banner offers it instead.
    event.preventDefault()
    useInstall.setState({ promptEvent: event as InstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => useInstall.setState({ installed: true, promptEvent: null }))
}
