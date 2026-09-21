import { describe, expect, it } from 'vitest'
import { checkIn, cleanPlayerName, createSession, recordScore, renamePlayer, startGame } from './engine'
import { rankPlayers } from './standings'
import type { SessionState } from './types'

function session(count = 4): SessionState {
  let s = createSession('doubles', 1)
  for (let id = 1; id <= count; id++) s = checkIn(s, { id, name: `Player ${id}`, skill: 3 })
  return s
}

describe('cleanPlayerName', () => {
  it('trims, and refuses an empty or too long name in words', () => {
    expect(cleanPlayerName('  Ann Lee ')).toBe('Ann Lee')
    expect(() => cleanPlayerName('   ')).toThrow('Enter a name')
    expect(() => cleanPlayerName('x'.repeat(81))).toThrow('at most 80 characters')
    expect(cleanPlayerName('x'.repeat(80))).toHaveLength(80)
  })
})

describe('renamePlayer', () => {
  it('changes the name of a checked-in player and nothing else', () => {
    const s = session()
    const next = renamePlayer(s, 2, '  Anne ')
    expect(next.players[2]).toEqual({ ...s.players[2], name: 'Anne' })
    expect(next.players[1]).toBe(s.players[1])
    expect(next.queue).toEqual(s.queue)
    expect(s.players[2].name).toBe('Player 2') // the old state is untouched
  })

  it('shows up wherever the player already is: on a court, in the queue and in the standings', () => {
    let s = session(5)
    s = startGame(s, 1)
    const playing = s.courts[0].teams!.flat()[0]
    const waiting = s.queue[0]
    s = recordScore(s, 1, 11, 5).state
    s = renamePlayer(renamePlayer(s, playing, 'Renamed Player'), waiting, 'Renamed Waiter')
    expect(rankPlayers(s).some((row) => row.name === 'Renamed Player')).toBe(true)
    expect(s.players[waiting].name).toBe('Renamed Waiter')
    // The game they played is still theirs: it refers to them by id.
    expect(s.matches?.[0].teams.flat()).toContain(playing)
  })

  it('refuses a name another player in the session already has, ignoring case and spaces', () => {
    const s = session()
    expect(() => renamePlayer(s, 1, ' player 2 ')).toThrow('Player 2 is already in this session'.replace('Player 2', 'player 2'))
  })

  it('allows changing only the capitals of their own name, and does nothing when it is unchanged', () => {
    const s = session()
    expect(renamePlayer(s, 1, 'PLAYER 1').players[1].name).toBe('PLAYER 1')
    expect(renamePlayer(s, 1, 'Player 1')).toBe(s)
  })

  it('refuses a player who is not in the session, and an empty name', () => {
    const s = session()
    expect(() => renamePlayer(s, 99, 'Anne')).toThrow('not in this session')
    expect(() => renamePlayer(s, 1, '  ')).toThrow('Enter a name')
  })
})
