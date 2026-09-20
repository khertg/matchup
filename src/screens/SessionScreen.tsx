import { EndSessionDialog } from '@/components/EndSessionDialog'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { matchmakingLabel } from '@/lib/matchmaking'
import type { SessionState } from '@/rotation/types'
import { useSessionStore } from '@/store/session'
import { BoardScreen } from './BoardScreen'
import { CheckInScreen } from './CheckInScreen'
import { StandingsScreen } from './StandingsScreen'

export function SessionScreen({ session }: { session: SessionState }) {
  const location = useSessionStore((s) => s.location)

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{location}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="secondary">{session.mode === 'doubles' ? 'Doubles' : 'Singles'}</Badge>
            {session.mode === 'doubles' && (
              <Badge variant="secondary">{matchmakingLabel(session.matchmaking)}</Badge>
            )}
            <Badge variant="secondary">
              {session.courts.length} {session.courts.length === 1 ? 'court' : 'courts'}
            </Badge>
          </div>
        </div>

        <EndSessionDialog session={session} />
      </header>

      <Tabs defaultValue="board">
        <TabsList className="w-full">
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="checkin">Check-in</TabsTrigger>
          <TabsTrigger value="standings">Standings</TabsTrigger>
        </TabsList>
        <TabsContent value="board" className="mt-4">
          <BoardScreen session={session} />
        </TabsContent>
        <TabsContent value="checkin" className="mt-4">
          <CheckInScreen session={session} />
        </TabsContent>
        <TabsContent value="standings" className="mt-4">
          <StandingsScreen session={session} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
