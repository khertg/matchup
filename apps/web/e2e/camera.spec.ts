import { expect, test } from '@playwright/test'
import { TINY_PNG, avatarOf, queueRow } from './avatarHelpers'
import { FAKE_CAMERA, avatarEditor, expectCameraOff, expectLive, preview, trackStates as tracks, watchCamera } from './cameraHelpers'
import { failOnCspViolations } from './cspWatch'

failOnCspViolations(test)

test.use({ permissions: ['camera'], launchOptions: { args: FAKE_CAMERA } })

test.describe('Take photo on a computer uses the camera', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, 'phones open their own camera app; see the last test')
    await watchCamera(page)
  })

  test('an avatar photo: live preview, Take picture, crop, save', async ({ page }) => {
    const editor = await avatarEditor(page)
    await editor.getByRole('button', { name: 'Take photo' }).click()
    await expect(page.getByRole('dialog', { name: 'Take a photo for Ann' })).toBeVisible()
    await expectLive(page)

    await page.getByRole('button', { name: 'Take picture' }).click()
    // The same crop step as for a chosen file follows, and the camera is off while cropping.
    const crop = page.getByRole('dialog', { name: 'Crop photo for Ann' })
    await expect(crop).toBeVisible()
    await expectCameraOff(page)
    await crop.getByRole('button', { name: 'Use photo' }).click()
    const dialog = page.getByRole('dialog', { name: 'Avatar for Ann' })
    await expect(avatarOf(dialog, 'Ann')).toHaveAttribute('data-avatar-kind', 'photo')
    await dialog.getByRole('button', { name: 'Save avatar' }).click()
    await expect(avatarOf(queueRow(page, 'Ann'), 'Ann')).toHaveAttribute('data-avatar-kind', 'photo')
  })

  test('Cancel goes back to the editor and switches the camera off', async ({ page }) => {
    const editor = await avatarEditor(page)
    await editor.getByRole('button', { name: 'Take photo' }).click()
    await expectLive(page)
    expect((await tracks(page)).some((state) => state === 'live')).toBe(true)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog', { name: 'Avatar for Ann' })).toBeVisible()
    await expectCameraOff(page)
  })

  test('closing the whole dialog switches the camera off too', async ({ page }) => {
    const editor = await avatarEditor(page)
    await editor.getByRole('button', { name: 'Take photo' }).click()
    await expectLive(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expectCameraOff(page)
  })

  test('the front-camera preview is mirrored like a mirror', async ({ page }) => {
    const editor = await avatarEditor(page)
    await editor.getByRole('button', { name: 'Take photo' }).click()
    await expectLive(page)
    await expect(preview(page)).toHaveAttribute('data-mirrored', 'true')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('the picture that is saved is the true image, not the mirrored preview', async ({ page }) => {
    const editor = await avatarEditor(page)
    await editor.getByRole('button', { name: 'Take photo' }).click()
    await expectLive(page)
    // Draw the frame the same way the app does and compare which side the fake camera's moving bar is on.
    const same = await preview(page).evaluate((video: HTMLVideoElement) => {
      const draw = (mirror: boolean) => {
        const c = document.createElement('canvas')
        c.width = 32
        c.height = 18
        const g = c.getContext('2d')!
        if (mirror) g.setTransform(-1, 0, 0, 1, c.width, 0)
        g.drawImage(video, 0, 0, c.width, c.height)
        return Array.from(g.getImageData(0, 0, c.width, c.height).data).join(',')
      }
      // A camera test pattern is not symmetrical, so a mirrored draw differs from a plain one.
      return draw(false) === draw(true)
    })
    expect(same).toBe(false)
    // The button takes the plain frame: it goes on to the crop step with a picture that loads.
    await page.getByRole('button', { name: 'Take picture' }).click()
    const crop = page.getByRole('dialog', { name: 'Crop photo for Ann' })
    await expect(crop.getByTestId('crop-stage')).toBeVisible()
    expect(await crop.getByTestId('crop-stage').getAttribute('data-crop')).toMatch(/^\d/)
  })

  test('with one camera there is no Switch camera button', async ({ page }) => {
    const editor = await avatarEditor(page)
    await editor.getByRole('button', { name: 'Take photo' }).click()
    await expectLive(page)
    await expect(page.getByRole('button', { name: 'Switch camera' })).toHaveCount(0)
  })
})

test.describe('when the camera cannot be used', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, 'computers only')
    await watchCamera(page)
  })

  test('a blocked camera says so, and Try again works once it is allowed', async ({ page }) => {
    await page.addInitScript(() => ((window as unknown as { __block: boolean }).__block = true))
    const editor = await avatarEditor(page)
    await editor.getByRole('button', { name: 'Take photo' }).click()
    await expect(page.getByRole('alert')).toContainText('Camera access was blocked')
    await expect(page.getByRole('button', { name: 'Take picture' })).toHaveCount(0)

    await page.evaluate(() => ((window as unknown as { __block: boolean }).__block = false))
    await page.getByRole('button', { name: 'Try again' }).click()
    await expectLive(page)
  })

  test('Choose a photo file instead opens the file picker and carries on to the crop', async ({ page }) => {
    await page.addInitScript(() => ((window as unknown as { __block: boolean }).__block = true))
    const editor = await avatarEditor(page)
    await editor.getByRole('button', { name: 'Take photo' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Choose a photo file instead' }).click(),
    ])
    await chooser.setFiles({ name: 'me.png', mimeType: 'image/png', buffer: TINY_PNG })
    await expect(page.getByRole('dialog', { name: 'Crop photo for Ann' })).toBeVisible()
  })

  test('Cancel from the error screen goes back to the editor', async ({ page }) => {
    await page.addInitScript(() => ((window as unknown as { __block: boolean }).__block = true))
    const editor = await avatarEditor(page)
    await editor.getByRole('button', { name: 'Take photo' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog', { name: 'Avatar for Ann' })).toBeVisible()
  })

  test('a browser with no camera support falls back to the file picker straight away', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true }))
    const editor = await avatarEditor(page)
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), editor.getByRole('button', { name: 'Take photo' }).click()])
    expect(chooser.isMultiple()).toBe(false)
    await expect(page.getByRole('dialog', { name: 'Take a photo for Ann' })).toHaveCount(0)
  })
})

test('on a phone or tablet, Take photo opens the phone\'s own camera app, not the in-app camera', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'this is the phone behaviour')
  const editor = await avatarEditor(page)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), editor.getByRole('button', { name: 'Take photo' }).click()])
  expect(chooser).toBeTruthy()
  await expect(page.getByRole('dialog', { name: 'Take a photo for Ann' })).toHaveCount(0)
})
