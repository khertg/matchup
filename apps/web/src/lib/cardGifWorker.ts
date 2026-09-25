/// <reference lib="webworker" />
/**
 * Draws and encodes the shared cards' GIFs off the main thread, so the page stays smooth while they are made.
 * Receives each page's two pictures and row positions (see lib/cardGif.ts); answers with the GIFs.
 */
import { buildCardGif, type GifPage } from '@/lib/cardGif'

export type WorkerRequest = { pages: GifPage[] }
export type WorkerResponse = { gifs: Blob[] } | { error: string }

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const gifs: Blob[] = []
    for (const page of event.data.pages) {
      const canvas = new OffscreenCanvas(page.width, page.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('no canvas')
      gifs.push(await buildCardGif(page, ctx))
    }
    self.postMessage({ gifs } satisfies WorkerResponse)
  } catch (error) {
    self.postMessage({ error: String(error) } satisfies WorkerResponse)
  }
}
