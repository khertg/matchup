/**
 * Makes the shared cards' GIFs in a worker where the browser can draw off the main thread (OffscreenCanvas),
 * otherwise on the page in small steps that let it keep responding. Loaded only when a GIF is wanted.
 */
import { buildCardGif, type GifPage } from '@/lib/cardGif'
import type { WorkerResponse } from '@/lib/cardGifWorker'

export async function makeCardGifs(pages: GifPage[], isCancelled: () => boolean): Promise<Blob[]> {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') return inWorker(pages, isCancelled)
  const gifs: Blob[] = []
  for (const page of pages) {
    const canvas = document.createElement('canvas')
    canvas.width = page.width
    canvas.height = page.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('no canvas')
    gifs.push(await buildCardGif(page, ctx, { isCancelled, pause: () => new Promise((r) => setTimeout(r, 0)) }))
  }
  return gifs
}

async function inWorker(pages: GifPage[], isCancelled: () => boolean): Promise<Blob[]> {
  const worker = new Worker(new URL('./cardGifWorker.ts', import.meta.url), { type: 'module' })
  let watch: ReturnType<typeof setInterval> | undefined
  try {
    return await new Promise<Blob[]>((resolve, reject) => {
      // A newer GIF was asked for (other colours or results): stop this one.
      watch = setInterval(() => {
        if (isCancelled()) reject(new Error('cancelled'))
      }, 100)
      worker.onmessage = (event: MessageEvent<WorkerResponse>) =>
        'gifs' in event.data ? resolve(event.data.gifs) : reject(new Error(event.data.error))
      worker.onerror = (event) => reject(new Error(event.message || 'worker failed'))
      // The pictures move to the worker instead of being copied.
      worker.postMessage({ pages }, pages.flatMap((page) => [page.background, page.finished]))
    })
  } finally {
    clearInterval(watch)
    worker.terminate()
  }
}
