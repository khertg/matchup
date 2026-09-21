import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import type { Picture } from '@/lib/avatar'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  coverScale,
  cropFromRect,
  cropFromView,
  fullRect,
  initialView,
  minRectSize,
  moveRect,
  panView,
  resizeRect,
  zoomView,
  type Crop,
  type Handle,
  type Rect,
  type View,
} from '@/lib/crop'

/** Side of the square frame the avatar picture is dragged under, in CSS pixels. */
const FRAME = 256
/** The largest area the logo picture is shown in. */
const RECT_STAGE = { width: 320, height: 240 }

interface Props {
  picture: Picture
  /** "circle": drag and zoom under a round frame (avatars). "rect": a free rectangle (logos). */
  mode: 'circle' | 'rect'
  busy?: boolean
  /** The chosen part of the picture, in its own pixels. */
  onConfirm: (crop: Crop) => void
  /** Rect mode only: keep the whole picture. */
  onWhole?: () => void
  onCancel: () => void
}

/** Round to whole pixels without ever leaving the picture. */
function whole(crop: Crop, width: number, height: number): Crop {
  const sw = Math.max(1, Math.min(width, Math.round(crop.sw)))
  const sh = Math.max(1, Math.min(height, Math.round(crop.sh)))
  return {
    sx: Math.max(0, Math.min(width - sw, Math.round(crop.sx))),
    sy: Math.max(0, Math.min(height - sh, Math.round(crop.sy))),
    sw,
    sh,
  }
}

/** Choose which part of a picked picture to use. */
export function PhotoCropper(props: Props) {
  return props.mode === 'circle' ? <CircleCropper {...props} /> : <RectCropper {...props} />
}

// ---- avatars: drag and zoom under a round frame ------------------------------------

function CircleCropper({ picture, busy, onConfirm, onCancel }: Props) {
  const { width, height } = picture
  const [view, setView] = useState<View>(initialView)
  const stage = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number } | null>(null)

  const scale = coverScale(width, height, FRAME) * view.zoom
  const crop = whole(cropFromView(view, width, height, FRAME), width, height)

  // The scroll wheel zooms around the pointer. It needs a listener that may cancel the page scroll.
  useEffect(() => {
    const element = stage.current
    if (!element) return
    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      const box = element!.getBoundingClientRect()
      const anchor = { x: event.clientX - box.left - FRAME / 2, y: event.clientY - box.top - FRAME / 2 }
      setView((v) => zoomView(v, v.zoom * Math.exp(-event.deltaY * 0.0015), width, height, FRAME, anchor))
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [width, height])

  function handleDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) }
    }
  }

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const last = pointers.current.get(event.pointerId)
    if (!last) return
    const now = { x: event.clientX, y: event.clientY }
    pointers.current.set(event.pointerId, now)

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const box = stage.current!.getBoundingClientRect()
      const anchor = { x: (a.x + b.x) / 2 - box.left - FRAME / 2, y: (a.y + b.y) / 2 - box.top - FRAME / 2 }
      const ratio = pinch.current.distance > 0 ? distance / pinch.current.distance : 1
      pinch.current.distance = distance
      setView((v) => zoomView(v, v.zoom * ratio, width, height, FRAME, anchor))
      return
    }
    setView((v) => panView(v, now.x - last.x, now.y - last.y, width, height, FRAME))
  }

  function handleUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 40 : 10
    const move = (dx: number, dy: number) => {
      event.preventDefault()
      setView((v) => panView(v, dx, dy, width, height, FRAME))
    }
    // Arrow keys nudge the picture the way a drag would: the picture follows the arrow.
    if (event.key === 'ArrowLeft') move(-step, 0)
    else if (event.key === 'ArrowRight') move(step, 0)
    else if (event.key === 'ArrowUp') move(0, -step)
    else if (event.key === 'ArrowDown') move(0, step)
    else if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      setView((v) => zoomView(v, v.zoom + 0.1, width, height, FRAME))
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      setView((v) => zoomView(v, v.zoom - 0.1, width, height, FRAME))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setView(initialView())
    }
  }

  const shownWidth = width * scale
  const shownHeight = height * scale

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div
          ref={stage}
          role="group"
          tabIndex={0}
          aria-label="Crop area. Drag the picture to move it, pinch or scroll to zoom. Arrow keys move it, plus and minus zoom."
          data-testid="crop-stage"
          data-crop={`${crop.sx},${crop.sy},${crop.sw},${crop.sh}`}
          data-zoom={view.zoom.toFixed(2)}
          className="relative touch-none overflow-hidden rounded-lg bg-black select-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
          style={{ width: FRAME, height: FRAME, cursor: 'grab' }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onKeyDown={handleKey}
        >
          <img
            src={picture.url}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{
              width: shownWidth,
              height: shownHeight,
              left: FRAME / 2 + view.ox - shownWidth / 2,
              top: FRAME / 2 + view.oy - shownHeight / 2,
            }}
          />
          {/* The round frame: everything outside the circle is dimmed. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/80"
            style={{ boxShadow: '0 0 0 999px rgba(0,0,0,0.55)' }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="crop-zoom" className="text-sm font-medium">
          Zoom
        </label>
        <input
          id="crop-zoom"
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={view.zoom}
          className="h-2 flex-1 accent-primary"
          onChange={(e) => setView((v) => zoomView(v, Number(e.target.value), width, height, FRAME))}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Back
        </Button>
        <Button type="button" disabled={busy} onClick={() => onConfirm(crop)}>
          Use photo
        </Button>
      </div>
    </div>
  )
}

// ---- logos: a free rectangle over the whole picture -----------------------------------

const HANDLES: { handle: Handle; label: string; style: React.CSSProperties; cursor: string }[] = [
  { handle: 'nw', label: 'top-left corner', style: { left: 0, top: 0 }, cursor: 'nwse-resize' },
  { handle: 'n', label: 'top edge', style: { left: '50%', top: 0 }, cursor: 'ns-resize' },
  { handle: 'ne', label: 'top-right corner', style: { left: '100%', top: 0 }, cursor: 'nesw-resize' },
  { handle: 'e', label: 'right edge', style: { left: '100%', top: '50%' }, cursor: 'ew-resize' },
  { handle: 'se', label: 'bottom-right corner', style: { left: '100%', top: '100%' }, cursor: 'nwse-resize' },
  { handle: 's', label: 'bottom edge', style: { left: '50%', top: '100%' }, cursor: 'ns-resize' },
  { handle: 'sw', label: 'bottom-left corner', style: { left: 0, top: '100%' }, cursor: 'nesw-resize' },
  { handle: 'w', label: 'left edge', style: { left: 0, top: '50%' }, cursor: 'ew-resize' },
]

function RectCropper({ picture, busy, onConfirm, onWhole, onCancel }: Props) {
  const { width, height } = picture
  const min = minRectSize(width, height)
  const [rect, setRect] = useState<Rect>(() => fullRect(width, height))
  // The picture is shown as large as fits, so a small logo is not tiny on screen.
  const k = Math.min(RECT_STAGE.width / width, RECT_STAGE.height / height)
  const drag = useRef<{ handle: Handle | 'move'; startX: number; startY: number; start: Rect } | null>(null)

  function begin(handle: Handle | 'move', event: PointerEvent<HTMLElement>) {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { handle, startX: event.clientX, startY: event.clientY, start: rect }
  }

  function handleMove(event: PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d) return
    const dx = (event.clientX - d.startX) / k
    const dy = (event.clientY - d.startY) / k
    setRect(d.handle === 'move' ? moveRect(d.start, dx, dy, width, height) : resizeRect(d.start, d.handle, dx, dy, width, height, min))
  }

  const end = () => {
    drag.current = null
  }

  function handleKey(event: KeyboardEvent<HTMLElement>, handle: Handle | 'move') {
    const step = Math.max(1, Math.round(4 / k))
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = arrows[event.key]
    if (!move) return
    event.preventDefault()
    if (handle === 'move' && event.shiftKey) {
      // Shift + arrows resize from the bottom and right edges: right and down grow, left and up shrink.
      setRect((r) => resizeRect(r, 'se', move[0], move[1], width, height, min))
    } else if (handle === 'move') {
      setRect((r) => moveRect(r, move[0], move[1], width, height))
    } else {
      setRect((r) => resizeRect(r, handle, move[0], move[1], width, height, min))
    }
  }

  const crop = whole(cropFromRect(rect), width, height)

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div
          data-testid="crop-stage"
          data-crop={`${crop.sx},${crop.sy},${crop.sw},${crop.sh}`}
          data-size={`${width}x${height}`}
          className="relative touch-none overflow-hidden rounded-lg bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:16px_16px] select-none"
          style={{ width: width * k, height: height * k }}
        >
          <img
            src={picture.url}
            alt="The picture to crop"
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full max-w-none"
          />
          <div
            role="group"
            tabIndex={0}
            aria-label="Crop rectangle. Drag to move it. Arrow keys move it, shift and arrow keys resize it."
            data-testid="crop-rect"
            className="absolute border-2 border-white outline outline-1 outline-black/60 focus-visible:ring-[3px] focus-visible:ring-ring"
            style={{
              left: rect.x * k,
              top: rect.y * k,
              width: rect.w * k,
              height: rect.h * k,
              cursor: 'move',
              boxShadow: '0 0 0 999px rgba(0,0,0,0.5)',
            }}
            onPointerDown={(e) => begin('move', e)}
            onPointerMove={handleMove}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => handleKey(e, 'move')}
          >
            {HANDLES.map(({ handle, label, style, cursor }) => (
              <button
                key={handle}
                type="button"
                aria-label={`Resize from the ${label}`}
                data-handle={handle}
                className="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow focus-visible:ring-[3px] focus-visible:ring-ring"
                style={{ ...style, cursor }}
                onPointerDown={(e) => begin(handle, e)}
                onPointerMove={handleMove}
                onPointerUp={end}
                onPointerCancel={end}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  handleKey(e, handle)
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground" aria-live="polite">
        Using {crop.sw} x {crop.sh} of {width} x {height}
      </p>

      <div className="grid gap-2">
        <Button type="button" disabled={busy} onClick={() => onConfirm(crop)}>
          Crop and use
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onWhole}>
          Use whole picture
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
