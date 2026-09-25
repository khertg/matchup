import { describe, expect, it } from 'vitest'
import { FRAME_COUNT, LAST_FRAME, SHINE_SAMPLE_FRAMES, frameDelay, rowProgress, shinePosition } from './standingsAnimation'

describe('standings animation', () => {
  it('slides rows in one after another, all in place by the end', () => {
    expect(rowProgress(0, 0)).toBe(0)
    expect(rowProgress(2, 0)).toBeGreaterThan(rowProgress(2, 1))
    expect(rowProgress(2, 3)).toBe(0)
    for (let row = 0; row < 10; row++) expect(rowProgress(LAST_FRAME, row)).toBe(1)
  })

  it('sweeps the light across gold, then silver, then bronze, after the rows are in, and never on the last frame', () => {
    const first = (medal: 'gold' | 'silver' | 'bronze') =>
      Array.from({ length: FRAME_COUNT }, (_, f) => f).find((f) => shinePosition(f, medal) !== null)!
    expect(first('gold')).toBeLessThan(first('silver'))
    expect(first('silver')).toBeLessThan(first('bronze'))
    expect(rowProgress(first('gold'), 9)).toBe(1)
    for (const medal of ['gold', 'silver', 'bronze'] as const) expect(shinePosition(LAST_FRAME, medal)).toBeNull()
  })

  it('samples the light on each medal row for the palette', () => {
    expect(SHINE_SAMPLE_FRAMES).toHaveLength(3)
    expect(shinePosition(SHINE_SAMPLE_FRAMES[0], 'gold')).not.toBeNull()
    expect(shinePosition(SHINE_SAMPLE_FRAMES[1], 'silver')).not.toBeNull()
    expect(shinePosition(SHINE_SAMPLE_FRAMES[2], 'bronze')).not.toBeNull()
  })

  it('holds the finished standings before looping', () => {
    expect(frameDelay(0)).toBeLessThan(100)
    expect(frameDelay(LAST_FRAME)).toBeGreaterThan(2000)
  })
})
