/**
 * Looping animated GIFs with gifenc (small, pure JS, no workers). Frames are added one at a time, so
 * only the encoded result is kept in memory. One palette, taken from sample frames given up front,
 * serves every frame, so colours never flicker from one frame to the next.
 */
import { applyPalette, GIFEncoder, quantize } from 'gifenc'

export interface GifWriter {
  /** Add the next frame (RGBA pixels, width × height) shown for `delay` ms. */
  add(rgba: Uint8ClampedArray, delay: number): void
  finish(): Blob
}

export function gifWriter(width: number, height: number, samples: Uint8ClampedArray[]): GifWriter {
  if (samples.length === 0) throw new Error('no sample frames')
  const joined = new Uint8Array(samples.reduce((n, f) => n + f.length, 0))
  let at = 0
  for (const sample of samples) {
    joined.set(sample, at)
    at += sample.length
  }
  const palette = quantize(joined, 256)
  const gif = GIFEncoder()
  return {
    add(rgba, delay) {
      // repeat: 0 (read from the first frame) makes it loop forever.
      gif.writeFrame(applyPalette(rgba, palette), width, height, { palette, delay, repeat: 0 })
    },
    finish() {
      gif.finish()
      return new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' })
    },
  }
}
