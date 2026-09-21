import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { describeCameraError, frameToFile, stopStream, type Facing } from '@/lib/camera'
import { cn } from '@/lib/utils'

interface Props {
  /** Which camera to prefer: the one facing the person (avatars) or facing away (a logo on a wall or shirt). */
  facing: Facing
  /** A picture was taken (or, from the error screen, a file was chosen instead). */
  onCapture: (file: File) => void
  onCancel: () => void
}

type State = { kind: 'starting' } | { kind: 'live' } | { kind: 'error'; message: string }

const VIDEO = { width: { ideal: 1280 }, height: { ideal: 720 } }

/**
 * A live camera view for taking a photo on a computer. The camera is switched off again as soon as
 * this goes away (taking the picture, Cancel, closing the dialog, switching camera).
 */
export function CameraCapture({ facing, onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>({ kind: 'starting' })
  const [ready, setReady] = useState(false)
  const [mirrored, setMirrored] = useState(facing === 'user')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [activeId, setActiveId] = useState<string | undefined>()
  // Choosing another camera by its id; without it the one facing the right way is used.
  const [wantedId, setWantedId] = useState<string | undefined>()
  const [attempt, setAttempt] = useState(0)
  const [taking, setTaking] = useState(false)

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    const video = videoRef.current
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: wantedId ? { ...VIDEO, deviceId: { exact: wantedId } } : { ...VIDEO, facingMode: { ideal: facing } },
          audio: false,
        })
        if (cancelled) {
          stopStream(stream)
          return
        }
        streamRef.current = stream
        const settings = stream.getVideoTracks()[0]?.getSettings() ?? {}
        setActiveId(settings.deviceId)
        // A camera that says which way it faces decides; otherwise trust what was asked for.
        setMirrored(settings.facingMode ? settings.facingMode === 'user' : facing === 'user')
        if (video) {
          video.srcObject = stream
          void video.play().catch(() => undefined)
        }
        setState({ kind: 'live' })
        // Camera names and choices only become available once access was granted.
        const all = await navigator.mediaDevices.enumerateDevices()
        if (!cancelled) setDevices(all.filter((d) => d.kind === 'videoinput'))
      } catch (error) {
        if (!cancelled) setState({ kind: 'error', message: describeCameraError(error) })
      }
    })()
    return () => {
      cancelled = true
      stopStream(stream)
      if (video) video.srcObject = null
    }
  }, [facing, wantedId, attempt])

  async function take() {
    const video = videoRef.current
    if (!video) return
    setTaking(true)
    try {
      const file = await frameToFile(video)
      // Off before anything else happens, so the camera light does not stay on while cropping.
      stopStream(streamRef.current)
      onCapture(file)
    } catch {
      // The preview goes away with the error screen, so the camera must not stay on behind it.
      stopStream(streamRef.current)
      setState({ kind: 'error', message: 'The picture could not be captured. Try again.' })
    } finally {
      setTaking(false)
    }
  }

  /** Start over: the camera is (re)started by the effect above, and this screen shows it starting. */
  function restart(next?: { deviceId: string }) {
    setState({ kind: 'starting' })
    setReady(false)
    if (next) setWantedId(next.deviceId)
    else setAttempt((n) => n + 1)
  }

  function switchCamera() {
    if (devices.length < 2) return
    const index = devices.findIndex((d) => d.deviceId === activeId)
    restart({ deviceId: devices[(index + 1) % devices.length].deviceId })
  }

  if (state.kind === 'error') {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => restart()}>
            Try again
          </Button>
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
            Choose a photo file instead
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Photo file"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onCapture(file)
          }}
        />
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Camera preview"
          data-mirrored={mirrored}
          onLoadedMetadata={() => setReady(true)}
          className={cn('aspect-video w-full object-cover', mirrored && '-scale-x-100')}
        />
        {state.kind === 'starting' && (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-white">
            Starting the camera. If your browser asks, allow it to use the camera.
          </p>
        )}
      </div>
      <Button type="button" className="w-full" disabled={!ready || taking} onClick={() => void take()}>
        Take picture
      </Button>
      <div className="flex gap-2">
        {devices.length > 1 && (
          <Button type="button" variant="outline" className="flex-1" onClick={switchCamera}>
            Switch camera
          </Button>
        )}
        <Button type="button" variant="ghost" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
