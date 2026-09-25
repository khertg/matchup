/**
 * Takes the two pictures a card's GIF is made from (lib/cardGif.ts): the finished card, and the card with
 * its moving pieces hidden. The pieces are the elements marked `data-piece`, with `data-kind`, `data-start`
 * and, for the light, `data-shine` (the frame it starts). Only these two pictures are taken on the page;
 * every frame is drawn from them elsewhere.
 */
import { toCanvas } from 'html-to-image'
import type { PieceKind } from '@/lib/cardAnimation'
import type { GifPage, PieceBox } from '@/lib/cardGif'

export interface CaptureOptions {
  pixelRatio: number
  /** From getFontEmbedCSS, worked out once for all the cards. */
  fontEmbedCSS: string
  /** Show or hide the card's moving pieces, synchronously (flushSync). */
  setHidden: (hidden: boolean) => void
  isCancelled: () => boolean
}

/**
 * Where each piece sits in a picture of the card that is `pictureWidth` pixels wide. Measured as a share
 * of the card, so a CSS transform on the way (the dialog's opening zoom) does not throw it off.
 */
export function pieceBoxes(card: HTMLElement, pictureWidth: number): PieceBox[] {
  const box = card.getBoundingClientRect()
  const scale = pictureWidth / box.width
  return [...card.querySelectorAll<HTMLElement>('[data-piece]')].map((piece) => {
    const r = piece.getBoundingClientRect()
    return {
      x: Math.round((r.left - box.left) * scale),
      y: Math.round((r.top - box.top) * scale),
      width: Math.round(r.width * scale),
      height: Math.round(r.height * scale),
      kind: (piece.dataset.kind as PieceKind | undefined) ?? 'slide',
      start: Number(piece.dataset.start ?? 0),
      shineStart: piece.dataset.shine === undefined ? null : Number(piece.dataset.shine),
    }
  })
}

/** Both pictures of one card, and its pieces. The card must be showing its finished frame. */
export async function captureCard(card: HTMLElement, options: CaptureOptions): Promise<Omit<GifPage, 'timing'>> {
  const picture = async () => {
    if (options.isCancelled()) throw new Error('cancelled')
    return createImageBitmap(await toCanvas(card, { pixelRatio: options.pixelRatio, fontEmbedCSS: options.fontEmbedCSS }))
  }
  const finished = await picture()
  const pieces = pieceBoxes(card, finished.width)
  options.setHidden(true)
  try {
    const background = await picture()
    return {
      background,
      finished,
      width: finished.width,
      height: finished.height,
      pieces,
      scale: finished.width / card.offsetWidth,
    }
  } finally {
    options.setHidden(false)
  }
}
