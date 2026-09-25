import { getFontEmbedCSS } from 'html-to-image'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { frameDelay, lastFrame, type CardTiming } from '@/lib/cardAnimation'
import { captureCard } from '@/lib/cardCapture'

/** GIF pictures are taken at this many pixels per CSS pixel: sharp in a chat, a few MB at most. */
const GIF_PIXEL_RATIO = 1.5

interface Options {
  /** Whether the share dialog is open: the preview plays and the GIFs are made only then. */
  open: boolean
  timing: CardTiming
  /** Everything the cards show. When it changes (other colours, other results) the GIFs are made again. */
  imageKey: string
  /** The cards on screen to turn into GIFs, in order. */
  cards: () => (HTMLElement | null)[]
  /** File names for that many GIFs. */
  fileNames: (count: number) => string[]
}

/**
 * The animated GIFs for a share dialog (the standings or a stats card), and the frame its preview shows.
 *
 * The GIFs are made as soon as the dialog opens, and again when what the cards show changes, not when
 * Share is tapped: browsers open the share sheet only within a few seconds of the tap, and making the
 * animation takes longer than that. Only two pictures of each card are taken on the page (lib/cardCapture.ts);
 * every frame is drawn from them in a worker (lib/cardGifRunner.ts), so the page stays smooth. Builds run
 * one at a time, and a build for what the cards no longer show is stopped.
 */
export function useCardGifs({ open, timing, imageKey, cards, fileNames }: Options) {
  const [frame, setFrame] = useState(0)
  const [capturing, setCapturing] = useState(false)
  const [piecesHidden, setPiecesHidden] = useState(false)
  const still = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // The preview plays the same animation the GIF will have, and stops while the pictures are taken.
  useEffect(() => {
    if (!open || capturing || still) return
    const timer = setTimeout(() => setFrame((f) => (f + 1) % timing.frameCount), frameDelay(timing, frame))
    return () => clearTimeout(timer)
  }, [open, capturing, still, frame, timing])

  const [prepared, setPrepared] = useState<{ key: string; files: File[] } | { key: string; failed: true } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  async function build(isCancelled: () => boolean): Promise<File[]> {
    const nodes = cards().filter((node): node is HTMLElement => !!node)
    if (nodes.length === 0) throw new Error('no card')
    // Loaded only when asked for, so the GIF encoder is not in the app every phone downloads.
    const { makeCardGifs } = await import('@/lib/cardGifRunner')
    const fontEmbedCSS = await getFontEmbedCSS(nodes[0])
    setCapturing(true)
    const pages = []
    try {
      flushSync(() => setFrame(lastFrame(timing)))
      for (const node of nodes) {
        const page = await captureCard(node, {
          pixelRatio: GIF_PIXEL_RATIO,
          fontEmbedCSS,
          isCancelled,
          setHidden: (hidden) => flushSync(() => setPiecesHidden(hidden)),
        })
        pages.push({ ...page, timing })
      }
    } finally {
      setCapturing(false)
    }
    const gifs = await makeCardGifs(pages, isCancelled)
    const names = fileNames(gifs.length)
    return gifs.map((gif, i) => new File([gif], names[i], { type: 'image/gif' }))
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    // A short pause, so picking through the colours does not start a new GIF for each one.
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
    /** The frame the cards on screen show: the preview, still for reduced motion. */
    frame: still && !capturing ? lastFrame(timing) : frame,
    piecesHidden,
    /** Ready to share, or null while they are being made. */
    files: prepared && prepared.key === imageKey && 'files' in prepared ? prepared.files : null,
    failed: prepared?.key === imageKey && 'failed' in prepared,
    retry: () => setAttempt((n) => n + 1),
    /** Start the preview from the top, for when the dialog opens. */
    restart: () => setFrame(0),
  }
}
