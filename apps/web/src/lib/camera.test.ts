import { describe, expect, it } from 'vitest'
import { MAX_CAPTURE_SIDE, captureSize, describeCameraError, shouldUseInAppCamera, stopStream } from './camera'

describe('shouldUseInAppCamera', () => {
  it('is used on a computer whose browser allows the camera', () => {
    expect(shouldUseInAppCamera({ hasCamera: true, touchFirst: false })).toBe(true)
  })

  it('is not used on a phone or tablet, which open their own camera app from the button', () => {
    expect(shouldUseInAppCamera({ hasCamera: true, touchFirst: true })).toBe(false)
  })

  it('is not used when the browser cannot reach the camera (for example a plain-HTTP address)', () => {
    expect(shouldUseInAppCamera({ hasCamera: false, touchFirst: false })).toBe(false)
    expect(shouldUseInAppCamera({ hasCamera: false, touchFirst: true })).toBe(false)
  })

  it('is false without a browser at all, so it never throws while rendering on a server', () => {
    expect(shouldUseInAppCamera()).toBe(false)
  })
})

describe('describeCameraError', () => {
  const named = (name: string) => Object.assign(new Error('x'), { name })

  it('explains a blocked camera and how to fix it', () => {
    for (const name of ['NotAllowedError', 'PermissionDeniedError', 'SecurityError']) {
      expect(describeCameraError(named(name))).toMatch(/blocked.*address bar/)
    }
  })

  it('says when there is no camera', () => {
    for (const name of ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError']) {
      expect(describeCameraError(named(name))).toBe('No camera was found on this computer.')
    }
  })

  it('says when another app has the camera', () => {
    for (const name of ['NotReadableError', 'TrackStartError', 'AbortError']) {
      expect(describeCameraError(named(name))).toBe('The camera is being used by another app.')
    }
  })

  it('has a plain fallback for anything else, including things that are not errors', () => {
    expect(describeCameraError(named('WeirdError'))).toBe('The camera could not be started.')
    expect(describeCameraError('oops')).toBe('The camera could not be started.')
    expect(describeCameraError(undefined)).toBe('The camera could not be started.')
    expect(describeCameraError({ name: 'NotAllowedError' })).toMatch(/blocked/)
  })
})

describe('captureSize', () => {
  it('keeps the size the camera made when it is small enough', () => {
    expect(captureSize(1280, 720)).toEqual({ width: 1280, height: 720 })
    expect(captureSize(720, 1280)).toEqual({ width: 720, height: 1280 })
  })

  it('scales a large frame down so its long side is at most the limit, keeping the shape', () => {
    expect(captureSize(3200, 1800)).toEqual({ width: MAX_CAPTURE_SIDE, height: 900 })
    expect(captureSize(1800, 3200)).toEqual({ width: 900, height: MAX_CAPTURE_SIDE })
  })

  it('never returns a side smaller than one pixel', () => {
    expect(captureSize(100000, 10, 100).height).toBeGreaterThanOrEqual(1)
  })
})

describe('stopStream', () => {
  it('stops every track, and copes with no stream', () => {
    let stopped = 0
    const stream = { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] } as unknown as MediaStream
    stopStream(stream)
    expect(stopped).toBe(2)
    expect(() => stopStream(null)).not.toThrow()
    expect(() => stopStream(undefined)).not.toThrow()
  })
})
