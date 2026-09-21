/**
 * The maths behind cropping a picture, with no DOM in it. Two ways to choose the crop:
 *  - "view" (avatars): a fixed square frame; the picture is dragged and zoomed under it.
 *  - "rect" (logos): a free rectangle drawn over the whole picture.
 * Both end as a rectangle in the picture's own pixels.
 */

/** A rectangle of the original picture, in its own pixels. */
export interface Crop {
  sx: number
  sy: number
  sw: number
  sh: number
}

// ---- view: drag and zoom a picture under a fixed square frame --------------------

/** How the picture sits under the frame. `zoom` is 1 when it just covers the frame. */
export interface View {
  zoom: number
  /** Where the picture's centre is, in frame pixels from the frame's centre. */
  ox: number
  oy: number
}

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4

export const initialView = (): View => ({ zoom: MIN_ZOOM, ox: 0, oy: 0 })

/** Pixels on screen per picture pixel when the picture just covers a square frame. */
export function coverScale(width: number, height: number, frame: number): number {
  return frame / Math.min(width, height)
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** The nearest view where the picture still covers the whole frame. */
export function clampView(view: View, width: number, height: number, frame: number): View {
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM)
  const scale = coverScale(width, height, frame) * zoom
  // How far the picture can move before the frame would show empty space.
  const slackX = Math.max(0, (width * scale - frame) / 2)
  const slackY = Math.max(0, (height * scale - frame) / 2)
  // Adding 0 turns a negative zero into a plain zero.
  return { zoom, ox: clamp(view.ox, -slackX, slackX) + 0, oy: clamp(view.oy, -slackY, slackY) + 0 }
}

/**
 * Change the zoom while a point under the frame (from its centre; the centre by default) stays
 * exactly where it is, as a pinch or a scroll wheel over that point would.
 */
export function zoomView(
  view: View,
  zoom: number,
  width: number,
  height: number,
  frame: number,
  anchor: { x: number; y: number } = { x: 0, y: 0 },
): View {
  const next = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
  const base = coverScale(width, height, frame)
  const before = base * view.zoom
  const after = base * next
  // The picture point under the anchor, so it can be put back under it after the zoom.
  const px = (anchor.x - view.ox) / before
  const py = (anchor.y - view.oy) / before
  return clampView({ zoom: next, ox: anchor.x - px * after, oy: anchor.y - py * after }, width, height, frame)
}

/** Move the picture by a distance in frame pixels, staying inside the limits. */
export function panView(view: View, dx: number, dy: number, width: number, height: number, frame: number): View {
  return clampView({ ...view, ox: view.ox + dx, oy: view.oy + dy }, width, height, frame)
}

/** The square of the original picture that the frame shows. */
export function cropFromView(view: View, width: number, height: number, frame: number): Crop {
  const v = clampView(view, width, height, frame)
  const scale = coverScale(width, height, frame) * v.zoom
  const size = frame / scale
  const cx = width / 2 - v.ox / scale
  const cy = height / 2 - v.oy / scale
  // Rounding must never push the square out of the picture.
  const sw = Math.min(size, width, height)
  return {
    sx: clamp(cx - sw / 2, 0, width - sw),
    sy: clamp(cy - sw / 2, 0, height - sw),
    sw,
    sh: sw,
  }
}

// ---- rect: a free rectangle over the whole picture --------------------------------

/** A crop rectangle in the picture's own pixels. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** The smallest a crop rectangle may be: tiny crops are never what anyone wants. */
export const minRectSize = (width: number, height: number) => Math.max(1, Math.min(24, Math.floor(Math.min(width, height) / 2)))

export const fullRect = (width: number, height: number): Rect => ({ x: 0, y: 0, w: width, h: height })

export const isFullRect = (rect: Rect, width: number, height: number) =>
  rect.x === 0 && rect.y === 0 && rect.w === width && rect.h === height

/** Slide the rectangle, keeping its size, inside the picture. */
export function moveRect(rect: Rect, dx: number, dy: number, width: number, height: number): Rect {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, width - rect.w),
    y: clamp(rect.y + dy, 0, height - rect.h),
  }
}

/**
 * Drag one handle by (dx, dy). The opposite edge stays where it is; the rectangle stays inside the
 * picture and never gets smaller than `min` in either direction.
 */
export function resizeRect(
  rect: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  width: number,
  height: number,
  min: number,
): Rect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.w
  let bottom = rect.y + rect.h
  if (handle.includes('w')) left = clamp(left + dx, 0, right - min)
  if (handle.includes('e')) right = clamp(right + dx, left + min, width)
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - min)
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + min, height)
  return { x: left, y: top, w: right - left, h: bottom - top }
}

export const cropFromRect = (rect: Rect): Crop => ({ sx: rect.x, sy: rect.y, sw: rect.w, sh: rect.h })
