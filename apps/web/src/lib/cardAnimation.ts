/**
 * The animation of the shared images (the standings and a player's stats card), as plain numbers so the
 * same timing drives the on-screen preview, the canvas frames and the GIF worker. A card is made of
 * pieces that appear one after another (sliding in, rising, or popping in), then a light crosses the
 * pieces marked for it, and the finished card holds before the GIF loops.
 */

export type PieceKind = 'slide' | 'slideUp' | 'pop'

/** Everything about a card's animation except where its pieces are. Plain data, so a worker can take it. */
export interface CardTiming {
  frameCount: number
  /** Frames for one piece to arrive. */
  pieceFrames: number
  /** Frames for the light to cross one piece. */
  shineFrames: number
  frameMs: number
  /** How long the finished card (the last frame) holds before the loop starts again. */
  holdMs: number
  /** Frames with the light halfway across each piece that gets it, for the GIF's palette. */
  shineSamples: number[]
}

/** How far a slide or rise travels, in CSS pixels, and how small a popping piece starts. */
const SLIDE_PX = 28
const RISE_PX = 16
const POP_FROM = 0.6

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const easeOut = (t: number) => 1 - (1 - t) ** 3

export const lastFrame = (timing: CardTiming) => timing.frameCount - 1

/** How far a piece that starts at `start` has arrived at a frame, 0 to 1, eased. */
export function pieceProgress(frame: number, start: number, pieceFrames: number): number {
  return easeOut(clamp01((frame - start) / pieceFrames))
}

/** Where a piece is drawn at a given progress: offset in CSS pixels, scale around its centre, opacity. */
export function pieceMotion(kind: PieceKind, progress: number): { dx: number; dy: number; scale: number; opacity: number } {
  const rest = 1 - progress
  return {
    dx: kind === 'slide' ? -rest * SLIDE_PX : 0,
    dy: kind === 'slideUp' ? rest * RISE_PX : 0,
    scale: kind === 'pop' ? POP_FROM + (1 - POP_FROM) * progress : 1,
    opacity: progress,
  }
}

/** The same motion as CSS, for the preview on screen. */
export function pieceStyle(kind: PieceKind, progress: number) {
  const { dx, dy, scale, opacity } = pieceMotion(kind, progress)
  return { opacity, transform: `translate(${dx}px, ${dy}px) scale(${scale})` }
}

/** Where the light is on a piece whose light starts at `start`: 0 to 1 while crossing, otherwise null. */
export function shineProgress(frame: number, start: number, shineFrames: number): number | null {
  const t = (frame - start) / shineFrames
  return t > 0 && t < 1 ? t : null
}

export const frameDelay = (timing: CardTiming, frame: number) =>
  frame === lastFrame(timing) ? timing.holdMs : timing.frameMs
