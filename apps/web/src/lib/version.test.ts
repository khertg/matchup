import { describe, expect, it } from 'vitest'
import { appBuild, appVersion, buildDetails, formatBuildDate, formatVersion } from './version'

describe('formatVersion', () => {
  it('shows only the release', () => {
    expect(formatVersion({ version: '0.1.0', commit: 'a1b2c3d', date: '2026-09-21' })).toBe('v0.1.0')
    expect(formatVersion({ version: '1.2.3', commit: 'dev', date: '2026-09-21' })).toBe('v1.2.3')
  })
})

describe('formatBuildDate', () => {
  it('reads the day as "21 Sep 2026"', () => {
    expect(formatBuildDate('2026-09-21')).toBe('21 Sep 2026')
  })

  it('drops the day-of-month zero and never shifts the day with the time zone', () => {
    expect(formatBuildDate('2026-01-05')).toBe('5 Jan 2026')
    expect(formatBuildDate('2026-12-31')).toBe('31 Dec 2026')
  })

  it('gives nothing for a broken date', () => {
    expect(formatBuildDate('not a date')).toBeNull()
    expect(formatBuildDate('2026-13-01')).toBeNull()
  })
})

describe('buildDetails', () => {
  it('gives the commit and the formatted build day', () => {
    expect(buildDetails({ version: '0.1.0', commit: 'a1b2c3d', date: '2026-09-21' })).toEqual({ commit: 'a1b2c3d', date: '21 Sep 2026' })
  })

  it('leaves the date out rather than showing a broken one', () => {
    expect(buildDetails({ version: '0.1.0', commit: 'a1b2c3d', date: 'not a date' })).toEqual({ commit: 'a1b2c3d', date: null })
  })

  it('gives nothing when the commit is not known (a dev build)', () => {
    expect(buildDetails({ version: '0.1.0', commit: 'dev', date: '2026-09-21' })).toBeNull()
    expect(buildDetails({ version: '0.1.0', commit: '', date: '2026-09-21' })).toBeNull()
  })
})

describe('the build this app was made from', () => {
  it('has a release number, a commit and a date, and a label made from them', () => {
    expect(appBuild.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(appBuild.commit.length).toBeGreaterThan(0)
    expect(appBuild.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(appVersion).toBe(`v${appBuild.version}`)
  })
})
