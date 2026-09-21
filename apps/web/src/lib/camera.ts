/**
 * Using the computer's camera from the "Take photo" buttons. Phones and tablets keep their own camera
 * app (the `capture` hint on a file input opens it); computers ignore that hint and just show a file
 * picker, so they get a live in-app camera instead.
 */

export type Facing = 'user' | 'environment'

/** The longest side of a captured picture. Anything larger is scaled down: it is cropped and shrunk later anyway. */
export const MAX_CAPTURE_SIDE = 1600

interface Environment {
  /** Whether `navigator.mediaDevices.getUserMedia` exists (it needs HTTPS or localhost). */
  hasCamera: boolean
  /** Whether the main way of pointing is touch, as on phones and tablets. */
  touchFirst: boolean
}

function currentEnvironment(): Environment {
  const hasCamera = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
  const touchFirst = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
  return { hasCamera, touchFirst }
}

/** True on a computer whose browser lets the page use the camera. */
export function shouldUseInAppCamera(env: Environment = currentEnvironment()): boolean {
  return env.hasCamera && !env.touchFirst
}

/** A camera problem in plain words. */
export function describeCameraError(error: unknown): string {
  const name = error instanceof Error || (typeof error === 'object' && error !== null && 'name' in error) ? String((error as { name: unknown }).name) : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow it from the camera icon in the address bar, then try again, or choose a photo file.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this computer.'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'The camera is being used by another app.'
    default:
      return 'The camera could not be started.'
  }
}

/** The size to draw a captured frame at: as the camera made it, but never more than `max` on the long side. */
export function captureSize(width: number, height: number, max: number = MAX_CAPTURE_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const scale = max / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * The current frame of a playing video as a JPEG file. It is the true image, never mirrored: the
 * live preview of a front camera is mirrored for the person looking at it, the saved picture is not.
 */
export async function frameToFile(video: HTMLVideoElement): Promise<File> {
  const size = captureSize(video.videoWidth, video.videoHeight)
  if (size.width < 1 || size.height < 1) throw new Error('The camera has no picture yet.')
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot capture pictures.')
  context.drawImage(video, 0, 0, size.width, size.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error('The picture could not be captured.')
  return new File([blob], 'camera.jpg', { type: 'image/jpeg', lastModified: Date.now() })
}

/** Turn the camera off (its indicator light goes out). */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop())
}
