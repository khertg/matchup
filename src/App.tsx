import { Toaster } from '@/components/ui/sonner'
import { SessionScreen } from '@/screens/SessionScreen'
import { SetupScreen } from '@/screens/SetupScreen'
import { useSessionStore } from '@/store/session'

export default function App() {
  const session = useSessionStore((s) => s.session)

  return (
    // Extra bottom padding lets the last controls scroll clear of the toasts pinned to the screen bottom.
    <main className="mx-auto max-w-5xl p-4 pb-32 sm:p-6 sm:pb-32">
      {session ? <SessionScreen session={session} /> : <SetupScreen />}
      <Toaster />
    </main>
  )
}
