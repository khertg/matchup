import { describe, expect, it } from 'vitest'
import { formatDuration } from './time'

describe('formatDuration', () => {
  it('shows hours and padded whole minutes, rounded down', () => {
    expect(formatDuration(60)).toBe('0:01')
    expect(formatDuration(42 * 60)).toBe('0:42')
    expect(formatDuration(42 * 60 + 59)).toBe('0:42')
  })

  it('shows 0:00 for less than a minute, and clamps negatives', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(45)).toBe('0:00')
    expect(formatDuration(59)).toBe('0:00')
    expect(formatDuration(-30)).toBe('0:00')
  })

  it('counts hours from an hour up', () => {
    expect(formatDuration(3600)).toBe('1:00')
    expect(formatDuration(65 * 60)).toBe('1:05')
    expect(formatDuration(10 * 3600 + 30 * 60)).toBe('10:30')
  })
})
