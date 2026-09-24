import { toast } from 'sonner'
import { requestRosterSync } from '@/cloud/sync'
import type { SkillLevel } from '@/db/db'
import { setRosterSkill } from '@/db/roster'
import { skillLabel } from '@/lib/skill'
import { useSessionStore } from '@/store/session'

/**
 * Changes the skill level of a player in the running session, and on their saved roster entry so
 * they start future sessions at it. Used by every staff view that shows a player's level.
 */
export function useSkillEditor() {
  const session = useSessionStore((s) => s.session)
  const setPlayerSkill = useSessionStore((s) => s.setPlayerSkill)

  return function changeSkill(playerId: number, skill: SkillLevel) {
    const name = session?.players[playerId]?.name ?? 'Player'
    setPlayerSkill(playerId, skill)
    void setRosterSkill(playerId, skill).then(() => requestRosterSync())
    toast(`${name} is now ${skillLabel(skill)}`)
  }
}
