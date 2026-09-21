import { expect, test } from '@playwright/test'
import { FAKE_CAMERA, avatarEditor, expectLive, watchCamera } from './cameraHelpers'
import { failOnCspViolations } from './cspWatch'

failOnCspViolations(test)

// Two fake cameras, so there is another one to switch to.
test.use({
  permissions: ['camera'],
  launchOptions: { args: [...FAKE_CAMERA, '--use-fake-device-for-media-stream=device-count=2'] },
})

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones open their own camera app')
  await watchCamera(page)
})

test('Switch camera appears with two cameras, moves to the other one, and switches the first off', async ({ page }) => {
  const editor = await avatarEditor(page)
  await editor.getByRole('button', { name: 'Take photo' }).click()
  await expectLive(page)

  const liveIds = () =>
    page.evaluate(() =>
      (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks
        .filter((t) => t.readyState === 'live')
        .map((t) => t.getSettings().deviceId),
    )
  const first = await liveIds()
  expect(first).toHaveLength(1)

  await page.getByRole('button', { name: 'Switch camera' }).click()
  await expect.poll(async () => {
    const [id] = await liveIds()
    return id !== undefined && id !== first[0]
  }).toBe(true)
  expect(await liveIds()).toHaveLength(1) // only one camera is on at a time
  await expectLive(page)

  // And back again.
  await page.getByRole('button', { name: 'Switch camera' }).click()
  await expect.poll(async () => (await liveIds())[0] === first[0]).toBe(true)
})
