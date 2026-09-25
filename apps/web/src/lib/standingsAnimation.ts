/**
 * The shared standings animation: the rows slide in one after another, then a light sweeps across the
 * gold, silver and bronze rows in turn, and the finished standings hold before the GIF loops.
 */
import { frameDelay as delayOf, lastFrame, pieceProgress, shineProgress, type CardTiming } from '@/lib/cardAnimation'
import type { Medal } from '@/rotation/standings'

/** Frames for one row to slide fully in; each row starts one frame after the one above. */
const ROW_IN_FRAMES = 5
/** Enough frames for a full page of rows (10) to be in. */
const INTRO_FRAMES = 9 + ROW_IN_FRAMES
/** Frames for the light to cross one medal row; gold starts, silver and bronze follow. */
const SHINE_FRAMES = 10
const SHINE_STAGGER = 3
const MEDAL_ORDER: Record<Medal, number> = { gold: 0, silver: 1, bronze: 2 }

/** The frame the light starts across a medal row. */
export const shineStart = (medal: Medal) => INTRO_FRAMES + MEDAL_ORDER[medal] * SHINE_STAGGER

export const STANDINGS_TIMING: CardTiming = {
  // One more frame after the bronze light has gone: the clean card that holds before the loop.
  frameCount: INTRO_FRAMES + 2 * SHINE_STAGGER + SHINE_FRAMES + 1,
  pieceFrames: ROW_IN_FRAMES,
  shineFrames: SHINE_FRAMES,
  frameMs: 70,
  holdMs: 2500,
  shineSamples: (['gold', 'silver', 'bronze'] as const).map((medal) => shineStart(medal) + Math.round(SHINE_FRAMES / 2)),
}

export const FRAME_COUNT = STANDINGS_TIMING.frameCount
/** Frames with the light halfway across the gold, silver and bronze rows, for building the GIF's palette. */
export const SHINE_SAMPLE_FRAMES = STANDINGS_TIMING.shineSamples
/** The frame the card shows when it is not animating: everything in place, no light. */
export const LAST_FRAME = lastFrame(STANDINGS_TIMING)

/** How far row `index` (0 at the top) has slid in at a frame, 0 to 1. */
export const rowProgress = (frame: number, index: number) => pieceProgress(frame, index, ROW_IN_FRAMES)

/**
 * Where the light is on a medal row at a frame: 0 (just off the left) to 1 (just off the right), or null
 * while it is not crossing that row.
 */
export const shinePosition = (frame: number, medal: Medal) => shineProgress(frame, shineStart(medal), SHINE_FRAMES)

export const frameDelay = (frame: number) => delayOf(STANDINGS_TIMING, frame)
