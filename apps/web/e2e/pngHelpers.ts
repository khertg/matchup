import { deflateSync } from 'node:zlib'
import type { Page } from '@playwright/test'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

export type Rgba = [number, number, number, number]

/** A real PNG whose pixels come from `pixel(x, y)`, so tests can tell which part of it ended up where. */
export function makePng(width: number, height: number, pixel: (x: number, y: number) => Rgba): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1)
    rows[row] = 0 // no filter
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y)
      rows.set([r, g, b, a], row + 1 + x * 4)
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export const RED: Rgba = [230, 30, 30, 255]
export const GREEN: Rgba = [30, 200, 60, 255]
export const BLUE: Rgba = [30, 60, 230, 255]

/** Three vertical stripes, red then green then blue: the colour at a spot says which part of the picture it is. */
export const stripes = (width = 300, height = 150) =>
  makePng(width, height, (x) => (x < width / 3 ? RED : x < (2 * width) / 3 ? GREEN : BLUE))

export type ColorName = 'red' | 'green' | 'blue'

/** Whether a sampled pixel is (near enough, for a compressed picture) that colour. */
export function isColor(pixel: number[], name: ColorName): boolean {
  const [r, g, b] = pixel
  if (name === 'red') return r > 150 && g < 110 && b < 110
  if (name === 'green') return g > 130 && r < 110 && b < 130
  return b > 150 && r < 110 && g < 130
}

/** Read the size of an image and the pixels at fractions of its width and height (0 to 1). */
export async function samplePicture(page: Page, src: string, points: [number, number][]) {
  return page.evaluate(
    async ({ src, points }) => {
      const image = new Image()
      image.src = src
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const pixels = points.map(([fx, fy]) => {
        const x = Math.min(canvas.width - 1, Math.floor(fx * canvas.width))
        const y = Math.min(canvas.height - 1, Math.floor(fy * canvas.height))
        return Array.from(context.getImageData(x, y, 1, 1).data)
      })
      return { width: canvas.width, height: canvas.height, pixels }
    },
    { src, points },
  )
}
