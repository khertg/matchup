import { describe, expect, it } from 'vitest'
import { appBuild, appVersion, formatVersion } from './version'

describe('formatVersion', () => {
  it('shows the release, the commit and the build date', () => {
    expect(formatVersion({ version: '0.1.0', commit: 'a1b2c3d', date: '2026-09-21' })).toBe('v0.1.0 · a1b2c3d · 21 Sep 2026')
  })

  it('drops the day-of-month zero and never shifts the day with the time zone', () => {
    expect(formatVersion({ version: '1.2.3', commit: 'abc1234', date: '2026-01-05' })).toBe('v1.2.3 · abc1234 · 5 Jan 2026')
    expect(formatVersion({ version: '1.2.3', commit: 'abc1234', date: '2026-12-31' })).toBe('v1.2.3 · abc1234 · 31 Dec 2026')
  })

  it('shows only the release and "dev" when the commit is not known', () => {
    expect(formatVersion({ version: '0.1.0', commit: 'dev', date: '2026-09-21' })).toBe('v0.1.0 · dev')
    expect(formatVersion({ version: '0.1.0', commit: '', date: '2026-09-21' })).toBe('v0.1.0 · dev')
  })

  it('leaves the date out rather than showing a broken one', () => {
    expect(formatVersion({ version: '0.1.0', commit: 'a1b2c3d', date: 'not a date' })).toBe('v0.1.0 · a1b2c3d')
    expect(formatVersion({ version: '0.1.0', commit: 'a1b2c3d', date: '2026-13-01' })).toBe('v0.1.0 · a1b2c3d')
  })
})

describe('the build this app was made from', () => {
  it('has a release number, a commit and a date, and a label made from them', () => {
    expect(appBuild.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(appBuild.commit.length).toBeGreaterThan(0)
    expect(appBuild.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(appVersion.startsWith(`v${appBuild.version}`)).toBe(true)
  })
})
