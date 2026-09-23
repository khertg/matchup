import { describe, expect, it } from 'vitest'
import { formatDuration } from './time'

describe('formatDuration', () => {
  it('shows whole minutes below an hour', () => {
    expect(formatDuration(42 * 60)).toBe('42 min')
    expect(formatDuration(42 * 60 + 59)).toBe('42 min')
    expect(formatDuration(60)).toBe('1 min')
  })

  it('shows whole seconds for less than a minute, and clamps negatives', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(59)).toBe('59s')
    expect(formatDuration(-30)).toBe('0s')
  })

  it('shows hours and padded minutes from an hour up', () => {
    expect(formatDuration(3600)).toBe('1h 00m')
    expect(formatDuration(65 * 60)).toBe('1h 05m')
    expect(formatDuration(10 * 3600 + 30 * 60)).toBe('10h 30m')
  })
})
