import { describe, expect, it } from 'vitest'
import type { Player } from '../db/db'
import { balanceDoubles } from './balance'

const p = (name: string, skill: Player['skill']): Player => ({ name, skill })

describe('balanceDoubles', () => {
  it('pairs strongest with weakest to even out teams', () => {
    const { teamA, teamB } = balanceDoubles([p('A', 6), p('B', 5), p('C', 2), p('D', 1)])
    const names = (t: Player[]) => t.map((x) => x.name).sort().join('')
    expect([names(teamA), names(teamB)].sort()).toEqual(['AD', 'BC'])
  })
})
