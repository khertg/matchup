import { expect, type Page } from '@playwright/test'
import { openAvatarEditor } from './avatarHelpers'
import { checkIn, startSession } from './helpers'

// Chromium can play a test pattern instead of a real camera, and grant the camera without asking.
export const FAKE_CAMERA = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']

/** Keep track of every camera track the page starts, so tests can tell when the camera was switched off. */
export async function watchCamera(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __tracks: MediaStreamTrack[]; __block: boolean }
    w.__tracks = []
    w.__block = false
    const devices = navigator.mediaDevices
    if (!devices) return
    const original = devices.getUserMedia.bind(devices)
    devices.getUserMedia = async (constraints) => {
      if (w.__block) throw new DOMException('Permission denied', 'NotAllowedError')
      const stream = await original(constraints)
      w.__tracks.push(...stream.getTracks())
      return stream
    }
  })
}

export const trackStates = (page: Page) =>
  page.evaluate(() => (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.map((t) => t.readyState))

export async function expectCameraOff(page: Page) {
  await expect
    .poll(async () => {
      const states = await trackStates(page)
      return states.length > 0 && states.every((s) => s === 'ended')
    })
    .toBe(true)
}

export const preview = (page: Page) => page.getByRole('dialog').getByLabel('Camera preview')

export async function expectLive(page: Page) {
  await expect.poll(() => preview(page).evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Take picture' })).toBeEnabled()
}

/** A session with Ann and Bob, and Ann's avatar editor open. */
export async function avatarEditor(page: Page) {
  await startSession(page)
  await checkIn(page, ['Ann', 'Bob'])
  return openAvatarEditor(page, 'Ann')
}
