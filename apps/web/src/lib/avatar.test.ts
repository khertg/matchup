import { MEDIA_LIMITS } from '@matchup/shared'
import { describe, expect, it } from 'vitest'
import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  avatarKey,
  colorFor,
  dataUrlBase64,
  dataUrlBytes,
  fitWithin,
  initialsOf,
  squareCrop,
} from './avatar'
import { resolveAvatar, resolveLogo, type MediaUrls } from './avatars'

describe('avatarKey', () => {
  it('is the trimmed, lower-case name, like the club leaderboard', () => {
    expect(avatarKey('  Ann LEE ')).toBe('ann lee')
    expect(avatarKey('Zoë')).toBe('zoë')
  })
})

describe('initialsOf', () => {
  it('takes the first letters of the first and last words, in capitals', () => {
    expect(initialsOf('Ann')).toBe('A')
    expect(initialsOf('ann lee')).toBe('AL')
    expect(initialsOf('  Mary  Jane   Watson ')).toBe('MW')
    expect(initialsOf('Zoë Ünal')).toBe('ZÜ')
  })

  it('keeps an emoji or an accented letter whole, and copes with nothing', () => {
    expect(initialsOf('😀 Bob')).toBe('😀B')
    expect(initialsOf('')).toBe('?')
    expect(initialsOf('   ')).toBe('?')
  })
})

describe('colorFor', () => {
  it('gives the same name the same colour, whatever its case or spacing', () => {
    expect(colorFor('Ann')).toBe(colorFor('  ann '))
    expect(colorFor('Ann')).toBe(colorFor('Ann'))
  })

  it('always picks one of the badge colours, and spreads names across them', () => {
    const names = Array.from({ length: 200 }, (_, i) => `Player ${i}`)
    const colors = new Set(names.map(colorFor))
    for (const c of colors) expect(AVATAR_COLORS).toContain(c)
    expect(colors.size).toBeGreaterThanOrEqual(AVATAR_COLORS.length - 2)
  })
})

describe('the emoji and colour choices', () => {
  it('are all distinct, and every colour is a #rrggbb the server accepts', () => {
    expect(new Set(AVATAR_EMOJIS).size).toBe(AVATAR_EMOJIS.length)
    expect(new Set(AVATAR_COLORS).size).toBe(AVATAR_COLORS.length)
    for (const c of AVATAR_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    for (const e of AVATAR_EMOJIS) expect([...e].length).toBeLessThanOrEqual(MEDIA_LIMITS.emojiChars)
  })
})

describe('squareCrop', () => {
  it('is the largest centred square', () => {
    expect(squareCrop(400, 300)).toEqual({ sx: 50, sy: 0, sw: 300, sh: 300 })
    expect(squareCrop(300, 400)).toEqual({ sx: 0, sy: 50, sw: 300, sh: 300 })
    expect(squareCrop(200, 200)).toEqual({ sx: 0, sy: 0, sw: 200, sh: 200 })
    expect(squareCrop(1, 1)).toEqual({ sx: 0, sy: 0, sw: 1, sh: 1 })
  })

  it('stays inside the picture, also for odd sizes', () => {
    for (const [w, h] of [[101, 50], [50, 101], [7, 3], [3, 7]]) {
      const c = squareCrop(w, h)
      expect(c.sx).toBeGreaterThanOrEqual(0)
      expect(c.sy).toBeGreaterThanOrEqual(0)
      expect(c.sx + c.sw).toBeLessThanOrEqual(w)
      expect(c.sy + c.sh).toBeLessThanOrEqual(h)
      expect(c.sw).toBe(c.sh)
    }
  })
})

describe('fitWithin', () => {
  it('scales down to fit, keeping the shape', () => {
    expect(fitWithin(1000, 500, 256)).toEqual({ width: 256, height: 128 })
    expect(fitWithin(500, 1000, 256)).toEqual({ width: 128, height: 256 })
    expect(fitWithin(512, 512, 256)).toEqual({ width: 256, height: 256 })
  })

  it('never scales up, and never reaches zero', () => {
    expect(fitWithin(100, 50, 256)).toEqual({ width: 100, height: 50 })
    expect(fitWithin(4000, 1, 256)).toEqual({ width: 256, height: 1 })
  })
})

describe('data URL sizes', () => {
  it('measure the decoded bytes, with and without padding', () => {
    const bytes = (n: number) => `data:image/png;base64,${Buffer.alloc(n, 7).toString('base64')}`
    for (const n of [0, 1, 2, 3, 4, 100, 1001]) expect(dataUrlBytes(bytes(n))).toBe(n)
  })

  it('gives the base64 text the API takes', () => {
    expect(dataUrlBase64('data:image/webp;base64,QUJD')).toBe('QUJD')
  })
})

describe('which avatar is shown', () => {
  const urls: MediaUrls = {
    photo: (slug, key, v) => `/api/clubs/${slug}/avatars/${encodeURIComponent(key)}/photo?v=${v}`,
    logo: (slug, v) => `/api/clubs/${slug}/logo?v=${v}`,
  }
  const club = (avatars: Record<string, { kind: 'photo' | 'emoji' | 'initials'; emoji?: string; color?: string; v: number }>, logo: { v: number } | null = null) => ({
    slug: 'downtown',
    index: { avatars, logo },
  })

  it('prefers this device’s avatar, by id', () => {
    const local = new Map([[1, { kind: 'emoji' as const, value: '🎾', color: '#123456' }]])
    const shown = resolveAvatar({ local, club: club({ ann: { kind: 'emoji', emoji: '🏆', color: '#654321', v: 1 } }) }, 1, 'Ann', urls)
    expect(shown).toEqual({ kind: 'emoji', value: '🎾', color: '#123456' })
  })

  it('shows a photo kept on this device as its data URL', () => {
    const local = new Map([[2, { kind: 'photo' as const, data: 'data:image/webp;base64,AAAA' }]])
    expect(resolveAvatar({ local, club: null }, 2, 'Bob', urls)).toEqual({ kind: 'photo', src: 'data:image/webp;base64,AAAA' })
  })

  it('falls back to the club’s avatar for that name, ignoring case', () => {
    const c = club({ 'ann lee': { kind: 'emoji', emoji: '🏆', color: '#654321', v: 5 } })
    expect(resolveAvatar({ local: new Map(), club: c }, undefined, 'Ann LEE', urls)).toEqual({ kind: 'emoji', value: '🏆', color: '#654321' })
    // Another device's roster id means nothing here: the name decides.
    expect(resolveAvatar({ local: new Map([[9, { kind: 'initials' as const, color: '#000000' }]]), club: c }, 1, 'Ann Lee', urls).kind).toBe('emoji')
  })

  it('points a club photo at its own URL, versioned', () => {
    const c = club({ ann: { kind: 'photo', v: 42 } })
    expect(resolveAvatar({ local: new Map(), club: c }, undefined, 'Ann', urls)).toEqual({
      kind: 'photo',
      src: '/api/clubs/downtown/avatars/ann/photo?v=42',
    })
  })

  it('uses the club’s colour for initials, and the name’s own colour when it has none', () => {
    const c = club({ ann: { kind: 'initials', color: '#abcdef', v: 1 }, bob: { kind: 'emoji', emoji: '🎾', v: 1 } })
    expect(resolveAvatar({ local: new Map(), club: c }, undefined, 'Ann', urls)).toEqual({ kind: 'initials', text: 'A', color: '#abcdef' })
    expect(resolveAvatar({ local: new Map(), club: c }, undefined, 'Bob', urls)).toEqual({ kind: 'emoji', value: '🎾', color: colorFor('Bob') })
  })

  it('shows automatic initials when nobody has set anything', () => {
    expect(resolveAvatar({ local: new Map(), club: null }, 3, 'Cy Dee', urls)).toEqual({
      kind: 'initials',
      text: 'CD',
      color: colorFor('Cy Dee'),
    })
    expect(resolveAvatar({ local: new Map(), club: club({}) }, undefined, 'Cy', urls).kind).toBe('initials')
  })

  it('does not use the club’s avatars when there is no cloud', () => {
    const c = club({ ann: { kind: 'emoji', emoji: '🎾', color: '#123456', v: 1 } })
    expect(resolveAvatar({ local: new Map(), club: c }, undefined, 'Ann', null).kind).toBe('initials')
  })
})

describe('which logo is shown', () => {
  const urls: MediaUrls = { photo: () => '', logo: (slug, v) => `/api/clubs/${slug}/logo?v=${v}` }
  const clubWithLogo = { slug: 'downtown', index: { avatars: {}, logo: { v: 7 } } }

  it('prefers this device’s logo, then the club’s', () => {
    expect(resolveLogo({ localLogo: 'data:image/png;base64,AAAA', club: clubWithLogo }, urls)).toBe('data:image/png;base64,AAAA')
    expect(resolveLogo({ localLogo: undefined, club: clubWithLogo }, urls)).toBe('/api/clubs/downtown/logo?v=7')
  })

  it('shows none when it was removed here, even if the club still has one for a moment', () => {
    expect(resolveLogo({ localLogo: null, club: clubWithLogo }, urls)).toBeNull()
  })

  it('shows none when there is no logo anywhere, or no cloud', () => {
    expect(resolveLogo({ localLogo: undefined, club: null }, urls)).toBeNull()
    expect(resolveLogo({ localLogo: undefined, club: { slug: 'downtown', index: { avatars: {}, logo: null } } }, urls)).toBeNull()
    expect(resolveLogo({ localLogo: undefined, club: clubWithLogo }, null)).toBeNull()
  })
})
