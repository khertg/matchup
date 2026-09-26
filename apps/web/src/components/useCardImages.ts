import { getFontEmbedCSS, toBlob } from 'html-to-image'
import { useEffect, useRef, useState } from 'react'

/** Pictures are taken at this many pixels per CSS pixel: sharp on any phone. */
const PIXEL_RATIO = 3

interface Options {
  /** Whether the share dialog is open: the images are made only then. */
  open: boolean
  /** Everything the cards show. When it changes (other colours, other results) the images are made again. */
  imageKey: string
  /** The cards on screen to turn into images, in order. */
  cards: () => (HTMLElement | null)[]
  /** File names for that many images. */
  fileNames: (count: number) => string[]
}

/**
 * The PNG images for a share dialog (the standings or a stats card).
 *
 * They are made as soon as the dialog opens, and again when what the cards show changes, not when Share is
 * tapped: browsers open the share sheet only straight after a tap, so nothing may be awaited in between.
 * Builds run one at a time, and a build for what the cards no longer show is dropped.
 */
export function useCardImages({ open, imageKey, cards, fileNames }: Options) {
  const [prepared, setPrepared] = useState<{ key: string; files: File[] } | { key: string; failed: true } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  async function build(isCancelled: () => boolean): Promise<File[]> {
    const nodes = cards().filter((node): node is HTMLElement => !!node)
    if (nodes.length === 0) throw new Error('no card')
    const fontEmbedCSS = await getFontEmbedCSS(nodes[0])
    const blobs: Blob[] = []
    for (const node of nodes) {
      if (isCancelled()) throw new Error('cancelled')
      const blob = await toBlob(node, { pixelRatio: PIXEL_RATIO, fontEmbedCSS })
      if (!blob) throw new Error('no image')
      blobs.push(blob)
    }
    const names = fileNames(blobs.length)
    return blobs.map((blob, i) => new File([blob], names[i], { type: 'image/png' }))
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // A short pause, so picking through the colours does not start a new image for each one.
    const timer = setTimeout(() => {
      queue.current = queue.current.then(() =>
        cancelled
          ? undefined
          : build(() => cancelled).then(
              (made) => !cancelled && setPrepared({ key: imageKey, files: made }),
              () => !cancelled && setPrepared({ key: imageKey, failed: true }),
            ),
      )
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // build reads the cards on screen, which imageKey describes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imageKey, attempt])

  return {
    /** Ready to share, or null while they are being made. */
    files: prepared && prepared.key === imageKey && 'files' in prepared ? prepared.files : null,
    failed: prepared?.key === imageKey && 'failed' in prepared,
    retry: () => setAttempt((n) => n + 1),
  }
}
