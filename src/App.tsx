import { Toaster } from '@/components/ui/sonner'
import { SessionScreen } from '@/screens/SessionScreen'
import { SetupScreen } from '@/screens/SetupScreen'
import { useSessionStore } from '@/store/session'

export default function App() {
  const session = useSessionStore((s) => s.session)

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      {session ? <SessionScreen session={session} /> : <SetupScreen />}
      <Toaster />
    </main>
  )
}
