import { useEffect } from 'react'
import { clubSlugFromPath } from '@matchup/shared'
import { startCloudSync } from '@/cloud/sync'
import { AvatarProvider } from '@/components/AvatarProvider'
import { Toaster } from '@/components/ui/sonner'
import { VersionLabel } from '@/components/VersionLabel'
import { SessionScreen } from '@/screens/SessionScreen'
import { SetupScreen } from '@/screens/SetupScreen'
import { ViewerScreen } from '@/screens/ViewerScreen'
import { useSessionStore } from '@/store/session'

export default function App() {
  const session = useSessionStore((s) => s.session)
  const path = window.location.pathname
  // Anything under /club is the public viewer, which never runs staff features.
  const isViewerPath = path === '/club' || path.startsWith('/club/')
  const viewerSlug = clubSlugFromPath(path)

  useEffect(() => {
    if (isViewerPath) return
    return startCloudSync()
  }, [isViewerPath])

  return (
    // Extra bottom padding lets the last controls scroll clear of the toasts pinned to the screen bottom.
    <AvatarProvider viewerSlug={isViewerPath ? (viewerSlug ?? undefined) : undefined}>
    <main className="mx-auto max-w-5xl p-4 pb-32 sm:p-6 sm:pb-32">
      {isViewerPath ? (
        viewerSlug ? (
          <ViewerScreen slug={viewerSlug} />
        ) : (
          <p className="py-10 text-center text-muted-foreground">
            That club link isn&apos;t valid. Check the link or scan the QR code again.
          </p>
        )
      ) : session ? (
        <SessionScreen session={session} />
      ) : (
        <SetupScreen />
      )}
      <VersionLabel />
      <Toaster />
    </main>
    </AvatarProvider>
  )
}
