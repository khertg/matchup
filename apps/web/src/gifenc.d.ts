/** The parts of gifenc (it ships no types) that the podium GIF uses. */
declare module 'gifenc' {
  export type Palette = number[][]
  export interface FrameOptions {
    palette?: Palette
    /** Milliseconds this frame shows for. */
    delay?: number
    /** -1 plays once, 0 loops forever, n loops n times. Read from the first frame only. */
    repeat?: number
    transparent?: boolean
    dispose?: number
  }
  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void
    finish(): void
    bytes(): Uint8Array
  }
  export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): Encoder
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: 'rgb565' | 'rgb444' | 'rgba4444' }): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array
}
