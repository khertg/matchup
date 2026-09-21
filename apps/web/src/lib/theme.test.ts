import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isDark, isThemeChoice } from './theme'

describe('isDark', () => {
  it('follows a saved choice, and the device setting for System or nothing saved', () => {
    expect(isDark('dark', false)).toBe(true)
    expect(isDark('light', true)).toBe(false)
    expect(isDark('system', true)).toBe(true)
    expect(isDark('system', false)).toBe(false)
    expect(isDark(null, true)).toBe(true)
    expect(isDark(undefined, false)).toBe(false)
    expect(isDark('nonsense', true)).toBe(true) // an unknown saved value is treated as System
  })

  it('knows the three choices', () => {
    expect(['light', 'dark', 'system'].every(isThemeChoice)).toBe(true)
    expect(isThemeChoice('blue')).toBe(false)
    expect(isThemeChoice(undefined)).toBe(false)
  })
})

/** Run public/theme-init.js, the script that sets the theme before the app draws, against a fake page. */
function runInit({ saved, systemDark, storage = true, matchMedia = true }: { saved: string | null; systemDark: boolean; storage?: boolean; matchMedia?: boolean }) {
  const code = readFileSync(path.resolve(import.meta.dirname, '../../public/theme-init.js'), 'utf8')
  const classes = new Set<string>()
  const root = {
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
    style: { colorScheme: '' },
  }
  const localStorage = {
    getItem: (key: string) => {
      if (!storage) throw new Error('storage blocked')
      return key === 'theme' ? saved : null
    },
  }
  const window = matchMedia ? { matchMedia: () => ({ matches: systemDark }) } : {}
  new Function('localStorage', 'window', 'document', code)(localStorage, window, { documentElement: root })
  return { dark: classes.has('dark'), colorScheme: root.style.colorScheme }
}

describe('public/theme-init.js', () => {
  it.each([
    ['dark', false, true],
    ['dark', true, true],
    ['light', true, false],
    ['light', false, false],
    ['system', true, true],
    ['system', false, false],
    [null, true, true],
    [null, false, false],
  ] as const)('saved %s with a system dark setting of %s gives dark = %s, the same as isDark', (saved, systemDark, expected) => {
    const result = runInit({ saved, systemDark })
    expect(result.dark).toBe(expected)
    expect(result.colorScheme).toBe(expected ? 'dark' : 'light')
    expect(result.dark).toBe(isDark(saved, systemDark))
  })

  it('does nothing and does not throw when storage is blocked or matchMedia is missing', () => {
    expect(() => runInit({ saved: 'dark', systemDark: true, storage: false })).not.toThrow()
    expect(runInit({ saved: 'dark', systemDark: true, storage: false }).dark).toBe(false)
    expect(() => runInit({ saved: 'system', systemDark: true, matchMedia: false })).not.toThrow()
  })
})
