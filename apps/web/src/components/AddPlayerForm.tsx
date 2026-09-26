import { useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MAX_PLAYER_NAME_LENGTH } from '@q2dink/shared'
import type { Gender, Player, SkillLevel } from '@/db/db'
import { DEFAULT_SKILL, SKILL_LEVELS, skillOptionLabel } from '@/lib/skill'

/** Select values can't be empty, so "not set" is a sentinel. */
type GenderChoice = Gender | 'U'

const GENDER_OPTIONS: { value: GenderChoice; label: string }[] = [
  { value: 'U', label: 'Not set' },
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
]

interface Props {
  /** The saved roster, for auto-complete. Undefined while it loads. */
  roster: Player[] | undefined
  genderRequired: boolean
  submitLabel: string
  /** Save (and check in) the player. Returns whether the form should be cleared for the next one. */
  onSubmit: (name: string, skill: SkillLevel, gender: Gender | undefined) => Promise<boolean>
}

/** Name, skill and gender of one player, as used to check someone in or to save them for later. */
export function AddPlayerForm({ roster, genderRequired, submitLabel, onSubmit }: Props) {
  const id = useId()
  const [name, setName] = useState('')
  const [skill, setSkill] = useState<SkillLevel>(DEFAULT_SKILL)
  const [gender, setGender] = useState<GenderChoice>('U')

  const canSubmit = name.trim() !== '' && (!genderRequired || gender !== 'U')

  function handleNameChange(value: string) {
    setName(value)
    // Returning players (picked from auto-complete) keep their saved details.
    const known = roster?.find((p) => p.name.toLowerCase() === value.trim().toLowerCase())
    if (known) {
      setSkill(known.skill)
      if (known.gender) setGender(known.gender)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    if (await onSubmit(name, skill, gender === 'U' ? undefined : gender)) {
      setName('')
      setSkill(DEFAULT_SKILL)
      setGender('U')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>Player name</Label>
        <Input
          id={`${id}-name`}
          list={`${id}-roster`}
          autoComplete="off"
          maxLength={MAX_PLAYER_NAME_LENGTH}
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
        />
        <datalist id={`${id}-roster`}>
          {roster?.map((p) => <option key={p.id} value={p.name} />)}
        </datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-skill`}>Skill level</Label>
        <Select value={String(skill)} onValueChange={(v) => setSkill(Number(v) as SkillLevel)}>
          <SelectTrigger id={`${id}-skill`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SKILL_LEVELS.map((s) => (
              <SelectItem key={s.value} value={String(s.value)}>
                {skillOptionLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-gender`}>
          Gender{genderRequired ? ' (required for mixed doubles)' : ' (optional)'}
        </Label>
        <Select value={gender} onValueChange={(v) => setGender(v as GenderChoice)}>
          <SelectTrigger id={`${id}-gender`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GENDER_OPTIONS.map((g) => (
              <SelectItem key={g.value} value={g.value}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="h-11 w-full" disabled={!canSubmit}>
        {submitLabel}
      </Button>
    </form>
  )
}
