/**
 * Builds a shared card's animated GIF (the standings, or a player's stats card) from two pictures of it:
 * the finished card, and the card with its moving pieces hidden. Each frame is that background with every
 * piece cut out of the finished picture and drawn where the animation has it (lib/cardAnimation.ts), plus
 * the light on the pieces marked for it. Plain canvas drawing, so it runs in a worker
 * (lib/cardGifWorker.ts) and the page stays smooth; `buildCardGif` also runs on the main thread.
 */
import { gifWriter } from '@/lib/gif'
import { frameDelay, lastFrame, pieceMotion, pieceProgress, shineProgress, type CardTiming, type PieceKind } from '@/lib/cardAnimation'

/** A moving piece's place in the pictures (picture pixels), how it arrives, and when its light starts. */
export interface PieceBox {
  x: number
  y: number
  width: number
  height: number
  kind: PieceKind
  start: number
  /** The frame the light starts across this piece, or null for no light. */
  shineStart: number | null
}

export interface GifPage {
  /** The card without its moving pieces, and the finished card, both width × height. */
  background: ImageBitmap
  finished: ImageBitmap
  width: number
  height: number
  pieces: PieceBox[]
  /** Picture pixels per CSS pixel, to scale motion distances and corner radii. */
  scale: number
  timing: CardTiming
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** The pieces' corner radius (rounded-lg), in CSS pixels; the light stays inside it. */
const RADIUS = 8

function roundedRect(ctx: Context2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** Draw one frame of the animation. */
export function drawFrame(ctx: Context2D, page: GifPage, frame: number) {
  const { timing, scale } = page
  ctx.globalAlpha = 1
  ctx.drawImage(page.background, 0, 0)
  for (const piece of page.pieces) {
    const progress = pieceProgress(frame, piece.start, timing.pieceFrames)
    if (progress <= 0) continue
    const motion = pieceMotion(piece.kind, progress)
    const w = piece.width * motion.scale
    const h = piece.height * motion.scale
    const x = piece.x + (piece.width - w) / 2 + motion.dx * scale
    const y = piece.y + (piece.height - h) / 2 + motion.dy * scale
    ctx.globalAlpha = motion.opacity
    ctx.drawImage(page.finished, piece.x, piece.y, piece.width, piece.height, x, y, w, h)
    ctx.globalAlpha = 1

    const shine = piece.shineStart === null ? null : shineProgress(frame, piece.shineStart, timing.shineFrames)
    if (shine === null) continue
    // The light: a soft white band crossing the piece from left to right, inside its rounded corners.
    ctx.save()
    roundedRect(ctx, x, y, w, h, RADIUS * scale)
    ctx.clip()
    const band = w / 2
    const left = x + (-0.5 + shine * 1.5) * w
    const light = ctx.createLinearGradient(left, 0, left + band, 0)
    light.addColorStop(0, 'rgba(255,255,255,0)')
    light.addColorStop(0.5, 'rgba(255,255,255,0.6)')
    light.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = light
    ctx.fillRect(left, y, band, h)
    ctx.restore()
  }
}

/** Every frame of one card, encoded as a looping GIF. `pause` lets a main-thread run keep the page responsive. */
export async function buildCardGif(
  page: GifPage,
  ctx: Context2D,
  options: { isCancelled?: () => boolean; pause?: () => Promise<void> } = {},
): Promise<Blob> {
  const { width, height, timing } = page
  const pixels = (frame: number) => {
    drawFrame(ctx, page, frame)
    return ctx.getImageData(0, 0, width, height).data
  }
  // One palette from the finished card and the light on each lit piece, so nothing flickers or bands.
  const gif = gifWriter(width, height, [pixels(lastFrame(timing)), ...timing.shineSamples.map(pixels)])
  for (let frame = 0; frame < timing.frameCount; frame++) {
    if (options.isCancelled?.()) throw new Error('cancelled')
    gif.add(pixels(frame), frameDelay(timing, frame))
    await options.pause?.()
  }
  return gif.finish()
}
