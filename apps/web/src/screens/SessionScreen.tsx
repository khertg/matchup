import { LayoutGridIcon, TrophyIcon, UserPlusIcon } from 'lucide-react'
import { useMemo } from 'react'
import { parseFullBackup } from '@/cloud/snapshot'
import { joinClubSession, keepMySession, useSyncStore } from '@/cloud/sync'
import { SessionMenu } from '@/components/SessionMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useClubName } from '@/lib/avatars'
import { matchmakingLabel } from '@/lib/matchmaking'
import { cn } from '@/lib/utils'
import type { SessionState } from '@/rotation/types'
import { useSessionStore } from '@/store/session'
import { BoardScreen } from './BoardScreen'
import { CheckInScreen } from './CheckInScreen'
import { StandingsScreen } from './StandingsScreen'

/**
 * Another staff device of the club is running a different session. Nothing more is sent from here until
 * staff choose: join that one (this device's session is dropped), or keep this one (it replaces theirs).
 */
function OtherSessionBanner() {
  const other = useSyncStore((s) => s.otherSession)
  const theirs = useMemo(() => (other ? parseFullBackup(other.full) : null), [other])
  if (!other) return null
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm">
      <p>
        Another staff device is running “{theirs?.location ?? 'another session'}”. Only one session can be
        live for the club.
      </p>
      <div className="flex flex-wrap gap-2">
        {theirs && (
          <Button size="sm" onClick={() => joinClubSession(other)}>
            Join “{theirs.location}”
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={keepMySession}>
          Keep this one
        </Button>
      </div>
    </div>
  )
}

export function SessionScreen({ session }: { session: SessionState }) {
  const location = useSessionStore((s) => s.location)
  const clubName = useClubName()

  return (
    // Bottom padding clears the fixed bottom tab bar (its height plus the home-indicator safe area).
    <div className="space-y-4 pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {clubName && <p className="break-words text-2xl font-bold">{clubName}</p>}
          <h1 className={cn('break-words', clubName ? 'text-sm text-muted-foreground' : 'text-2xl font-bold')}>
            {location}
          </h1>
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

        <SessionMenu session={session} />
      </header>

      <OtherSessionBanner />

      <Tabs defaultValue="board">
        <TabsList variant="bottom-bar">
          <TabsTrigger value="board">
            <LayoutGridIcon aria-hidden="true" />
            Board
          </TabsTrigger>
          <TabsTrigger value="checkin">
            <UserPlusIcon aria-hidden="true" />
            Check-in
          </TabsTrigger>
          <TabsTrigger value="standings">
            <TrophyIcon aria-hidden="true" />
            Standings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="board">
          <BoardScreen session={session} />
        </TabsContent>
        <TabsContent value="checkin">
          <CheckInScreen session={session} />
        </TabsContent>
        <TabsContent value="standings">
          <StandingsScreen session={session} location={location} repeatStats share />
        </TabsContent>
      </Tabs>
    </div>
  )
}
