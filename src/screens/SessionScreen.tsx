import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { matchmakingLabel } from '@/lib/matchmaking'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SessionState } from '@/rotation/types'
import { useSessionStore } from '@/store/session'
import { BoardScreen } from './BoardScreen'
import { CheckInScreen } from './CheckInScreen'

export function SessionScreen({ session }: { session: SessionState }) {
  const location = useSessionStore((s) => s.location)
  const endSession = useSessionStore((s) => s.endSession)

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{location}</h1>
          <div className="mt-1 flex gap-2">
            <Badge variant="secondary">{session.mode === 'doubles' ? 'Doubles' : 'Singles'}</Badge>
            {session.mode === 'doubles' && (
              <Badge variant="secondary">{matchmakingLabel(session.matchmaking)}</Badge>
            )}
            <Badge variant="secondary">
              {session.courts.length} {session.courts.length === 1 ? 'court' : 'courts'}
            </Badge>
          </div>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">End session</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>End this session?</DialogTitle>
              <DialogDescription>
                The queue and court assignments will be cleared. Your saved player list is kept.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Keep playing</Button>
              </DialogClose>
              <Button variant="destructive" onClick={endSession}>
                End session
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Tabs defaultValue="board">
        <TabsList className="w-full">
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="checkin">Check-in</TabsTrigger>
        </TabsList>
        <TabsContent value="board" className="mt-4">
          <BoardScreen session={session} />
        </TabsContent>
        <TabsContent value="checkin" className="mt-4">
          <CheckInScreen session={session} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
