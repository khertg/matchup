import { describe, expect, it } from 'vitest'
import { lastFrame, pieceMotion, pieceProgress, shineProgress } from './cardAnimation'
import { STATS_LAST_FRAME, STATS_PIECES, STATS_SHINE_START, STATS_TIMING } from './statsAnimation'

describe('stats card animation', () => {
  const progress = (part: keyof typeof STATS_PIECES, frame: number) =>
    pieceProgress(frame, STATS_PIECES[part].start, STATS_TIMING.pieceFrames)

  it('brings in the rank, avatar, name, lines and stat boxes in that order, all in place at the end', () => {
    const order = ['rank', 'avatar', 'name', 'finished', 'title', 'stat0', 'stat1', 'stat2', 'stat3'] as const
    const starts = order.map((part) => STATS_PIECES[part].start)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    for (const part of order) expect(progress(part, STATS_LAST_FRAME)).toBe(1)
    expect(progress('stat3', 0)).toBe(0)
  })

  it('lights the name only after everything is in, and never on the held last frame', () => {
    expect(progress('stat3', STATS_SHINE_START)).toBe(1)
    expect(shineProgress(STATS_SHINE_START + 1, STATS_SHINE_START, STATS_TIMING.shineFrames)).not.toBeNull()
    expect(shineProgress(STATS_LAST_FRAME, STATS_SHINE_START, STATS_TIMING.shineFrames)).toBeNull()
    for (const sample of STATS_TIMING.shineSamples) {
      expect(shineProgress(sample, STATS_SHINE_START, STATS_TIMING.shineFrames)).not.toBeNull()
    }
    expect(lastFrame(STATS_TIMING)).toBe(STATS_LAST_FRAME)
  })

  it('slides, rises and pops into place', () => {
    expect(pieceMotion('slide', 0)).toMatchObject({ dx: -28, dy: 0, scale: 1, opacity: 0 })
    expect(pieceMotion('slideUp', 0)).toMatchObject({ dx: 0, dy: 16, scale: 1 })
    expect(pieceMotion('pop', 0).scale).toBeCloseTo(0.6)
    for (const kind of ['slide', 'slideUp', 'pop'] as const) {
      const { dx, dy, scale, opacity } = pieceMotion(kind, 1)
      expect([dx, dy, scale, opacity].map((n) => n + 0)).toEqual([0, 0, 1, 1])
    }
  })
})
