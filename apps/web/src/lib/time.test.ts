import { describe, expect, it } from 'vitest'
import { formatDuration } from './time'

describe('formatDuration', () => {
  it('shows minutes and seconds, rounded down to the second', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(59.9)).toBe('59s')
    expect(formatDuration(60)).toBe('1m')
    expect(formatDuration(7 * 60 + 10)).toBe('7m10s')
    expect(formatDuration(42 * 60 + 59)).toBe('42m59s')
  })

  it('shows 0s for nothing, and clamps negatives', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(0.5)).toBe('0s')
    expect(formatDuration(-30)).toBe('0s')
  })

  it('counts hours from an hour up, leaving out zero parts', () => {
    expect(formatDuration(3600)).toBe('1h')
    expect(formatDuration(3605)).toBe('1h5s')
    expect(formatDuration(65 * 60)).toBe('1h5m')
    expect(formatDuration(3661)).toBe('1h1m1s')
    expect(formatDuration(10 * 3600 + 30 * 60)).toBe('10h30m')
  })
})
