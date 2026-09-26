import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { useClubAuth } from '@/cloud/auth'
import { requestRosterSync } from '@/cloud/sync'
import { AddPlayerForm } from '@/components/AddPlayerForm'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { SkillBadge } from '@/components/SkillBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { Gender, SkillLevel } from '@/db/db'
import { addOrGetPlayer, findSavedPlayer, listRoster, setRosterSkill } from '@/db/roster'

/**
 * The club's saved players, and a way to add more before any session has started. Saving only puts
 * them on the roster: they are checked in later, from "Check in from the roster".
 */
export function SavedPlayersDialog() {
  const clubSlug = useClubAuth((s) => s.club?.slug)
  const roster = useLiveQuery(() => listRoster(clubSlug), [clubSlug])

  async function handleAdd(name: string, skill: SkillLevel, gender: Gender | undefined) {
    const known = await findSavedPlayer(clubSlug, name)
    const player = await addOrGetPlayer(name, skill, gender, clubSlug)
    requestRosterSync()
    toast(known ? `${player.name} is already saved` : `${player.name} saved`)
    return true
  }

  async function changeSkill(id: number, skill: SkillLevel) {
    await setRosterSkill(id, skill)
    requestRosterSync()
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" className="w-full">
          Saved players
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Saved players{roster ? ` (${roster.length})` : ''}</DialogTitle>
          <DialogDescription>
            Add players ahead of time. Once a session starts, check them in from the roster with one tap.
          </DialogDescription>
        </DialogHeader>

        <AddPlayerForm roster={roster} genderRequired={false} submitLabel="Save player" onSubmit={handleAdd} />

        {roster && roster.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved players yet.</p>
        ) : (
          <ul aria-label="Saved players" className="divide-y">
            {roster?.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <PlayerAvatar name={p.name} editable />
                  <span className="min-w-0 truncate">{p.name}</span>
                </span>
                <SkillBadge player={p} display="name" onChange={(skill) => void changeSkill(p.id!, skill)} />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
