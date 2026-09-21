import { useEffect } from 'react'
import { clubSlugFromPath } from '@q2dink/shared'
import { useClubAuth } from '@/cloud/auth'
import { cloud } from '@/cloud/client'
import { requiresLogin } from '@/cloud/gate'
import { startCloudSync } from '@/cloud/sync'
import { AvatarProvider } from '@/components/AvatarProvider'
import { LoginGate } from '@/components/LoginGate'
import { RecoveryCodeHost } from '@/components/RecoveryCodeHost'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { Toaster } from '@/components/ui/sonner'
import { VersionLabel } from '@/components/VersionLabel'
import { SessionScreen } from '@/screens/SessionScreen'
import { SetupScreen } from '@/screens/SetupScreen'
import { ViewerScreen } from '@/screens/ViewerScreen'
import { useSessionStore } from '@/store/session'

export default function App() {
  const session = useSessionStore((s) => s.session)
  const signedIn = useClubAuth((s) => s.club !== null)
  const path = window.location.pathname
  // Anything under /club is the public viewer, which never runs staff features.
  const isViewerPath = path === '/club' || path.startsWith('/club/')
  const viewerSlug = clubSlugFromPath(path)
  // With a cloud set up, staff log in to a club first; the saved login keeps the app working offline.
  const mustLogIn = requiresLogin({ cloudConfigured: cloud !== null, signedIn, isViewerPath })

  useEffect(() => {
    if (isViewerPath) return
    return startCloudSync()
  }, [isViewerPath])

  return (
    // Extra bottom padding lets the last controls scroll clear of the toasts pinned to the screen bottom.
    <AvatarProvider viewerSlug={isViewerPath ? (viewerSlug ?? undefined) : undefined}>
    <main className="mx-auto max-w-5xl p-4 pb-32 sm:p-6 sm:pb-32">
      <div className="mb-2 flex justify-end">
        <ThemeSwitch />
      </div>
      {isViewerPath ? (
        viewerSlug ? (
          <ViewerScreen slug={viewerSlug} />
        ) : (
          <p className="py-10 text-center text-muted-foreground">
            That club link isn&apos;t valid. Check the link or scan the QR code again.
          </p>
        )
      ) : mustLogIn ? (
        <LoginGate />
      ) : session ? (
        <SessionScreen session={session} />
      ) : (
        <SetupScreen />
      )}
      <VersionLabel />
      <RecoveryCodeHost />
      <Toaster />
    </main>
    </AvatarProvider>
  )
}
