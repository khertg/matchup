import { expect, test, type Locator, type Page } from '@playwright/test'
import { checkIn, startSession } from './helpers'
import { avatarOf, openAvatarEditor, queueRow } from './avatarHelpers'
import { isColor, samplePicture, stripes } from './pngHelpers'

/** Red, green and blue thirds of a 300 x 150 picture. The centred square is x 75 to 225. */
const PICTURE = stripes(300, 150)

const cropRegion = (page: Page, name: string) => page.getByRole('dialog', { name: `Crop photo for ${name}` })
const stage = (page: Page, name: string) => cropRegion(page, name).getByTestId('crop-stage')

/** The crop the stage says it will use, in the picture's own pixels. */
async function cropOf(locator: Locator) {
  const [sx, sy, sw, sh] = (await locator.getAttribute('data-crop'))!.split(',').map(Number)
  return { sx, sy, sw, sh }
}

/** Open the crop step for a player by choosing the striped picture. */
async function startCrop(page: Page, name = 'Ann') {
  const dialog = await openAvatarEditor(page, name)
  await dialog.getByLabel('Choose a photo file').setInputFiles({ name: 'stripes.png', mimeType: 'image/png', buffer: PICTURE })
  await expect(stage(page, name)).toBeVisible()
  return dialog
}

async function saveCrop(page: Page, name = 'Ann') {
  await cropRegion(page, name).getByRole('button', { name: 'Use photo' }).click()
  await page.getByRole('dialog', { name: `Avatar for ${name}` }).getByRole('button', { name: 'Save avatar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const src = await avatarOf(queueRow(page, name), name).locator('img').getAttribute('src')
  return samplePicture(page, src!, [
    [0.05, 0.5],
    [0.5, 0.5],
    [0.95, 0.5],
    [0.05, 0.05],
    [0.95, 0.95],
  ])
}

async function drag(page: Page, target: Locator, dx: number, dy = 0) {
  const box = (await target.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 })
  await page.mouse.move(x + dx, y + dy, { steps: 4 })
  await page.mouse.up()
}

test.describe('avatars', () => {
  test.beforeEach(async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
  })

  test.describe('choosing a photo starts a crop', () => {
    test('shows the picture under a round frame, starting on the centred square, with nothing else to do', async ({ page }) => {
      const dialog = await startCrop(page)
      const box = stage(page, 'Ann')
      expect(await cropOf(box)).toEqual({ sx: 75, sy: 0, sw: 150, sh: 150 })
      await expect(box).toHaveAttribute('data-zoom', '1.00')
      await expect(cropRegion(page, 'Ann').getByRole('slider', { name: 'Zoom' })).toHaveValue('1')
      // One thing at a time: the emoji and colour choices are out of the way, and nothing is saved yet.
      await expect(cropRegion(page, 'Ann').getByRole('button', { name: /^Emoji / })).toHaveCount(0)
      await expect(cropRegion(page, 'Ann').getByRole('button', { name: /^Colour / })).toHaveCount(0)
      await expect(dialog).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(avatarOf(queueRow(page, 'Ann'), 'Ann')).toHaveAttribute('data-avatar-kind', 'initials')
    })

    test('Back returns to the editor with the avatar unchanged', async ({ page }) => {
      await startCrop(page)
      await cropRegion(page, 'Ann').getByRole('button', { name: 'Back' }).click()
      const editor = page.getByRole('dialog', { name: 'Avatar for Ann' })
      await expect(editor).toBeVisible()
      await expect(avatarOf(editor, 'Ann')).toHaveAttribute('data-avatar-kind', 'initials')
      await expect(editor.getByRole('button', { name: 'Choose photo' })).toBeVisible()
    })

    test('the centred crop is what saves when nothing is moved, at 128 x 128 and a small size', async ({ page }) => {
      await startCrop(page)
      const result = await saveCrop(page)
      expect([result.width, result.height]).toEqual([128, 128])
      // x 75 to 225: a little red, then green, then a little blue.
      expect(isColor(result.pixels[0], 'red')).toBe(true)
      expect(isColor(result.pixels[1], 'green')).toBe(true)
      expect(isColor(result.pixels[2], 'blue')).toBe(true)
      const src = await avatarOf(queueRow(page, 'Ann'), 'Ann').locator('img').getAttribute('src')
      expect((src!.length * 3) / 4).toBeLessThan(48 * 1024)
    })
  })

  test.describe('choosing the crop', () => {
    test('dragging the picture left shows its right side; dragging right shows its left side', async ({ page }) => {
      await startCrop(page)
      const box = stage(page, 'Ann')
      await drag(page, box, -400)
      // Dragged as far as it goes: the frame shows x 150 to 300, green then blue.
      expect(await cropOf(box)).toEqual({ sx: 150, sy: 0, sw: 150, sh: 150 })
      await drag(page, box, 900)
      expect(await cropOf(box)).toEqual({ sx: 0, sy: 0, sw: 150, sh: 150 })
      // Left again, part of the way: the crop moves with the drag, one to one on screen.
      await drag(page, box, -100)
      const partway = await cropOf(box)
      expect(partway.sx).toBeGreaterThan(50)
      expect(partway.sx).toBeLessThan(80)
    })

    test('a dragged crop is what saves', async ({ page }) => {
      await startCrop(page)
      await drag(page, stage(page, 'Ann'), -400)
      const result = await saveCrop(page)
      // x 150 to 300: green on the left half of the picture, blue on the right.
      expect(isColor(result.pixels[0], 'green')).toBe(true)
      expect(isColor(result.pixels[2], 'blue')).toBe(true)
      expect(isColor(result.pixels[3], 'green')).toBe(true)
      expect(isColor(result.pixels[4], 'blue')).toBe(true)
    })

    test('dragging the other way saves the left side', async ({ page }) => {
      await startCrop(page)
      await drag(page, stage(page, 'Ann'), 400)
      const result = await saveCrop(page)
      // x 0 to 150: red on the left, green on the right.
      expect(isColor(result.pixels[0], 'red')).toBe(true)
      expect(isColor(result.pixels[2], 'green')).toBe(true)
    })

    test('zooming in with the slider saves only what is in the middle', async ({ page }) => {
      await startCrop(page)
      const slider = cropRegion(page, 'Ann').getByRole('slider', { name: 'Zoom' })
      await slider.fill('4')
      const box = stage(page, 'Ann')
      await expect(box).toHaveAttribute('data-zoom', '4.00')
      const crop = await cropOf(box)
      expect(crop.sw).toBeLessThan(40)
      expect(crop.sx).toBeGreaterThan(100) // still centred on the picture
      const result = await saveCrop(page)
      for (const pixel of result.pixels) expect(isColor(pixel, 'green')).toBe(true)
    })

    test('the slider cannot zoom out past the picture filling the circle', async ({ page }) => {
      await startCrop(page)
      const slider = cropRegion(page, 'Ann').getByRole('slider', { name: 'Zoom' })
      await expect(slider).toHaveAttribute('min', '1')
      await slider.fill('3')
      await slider.fill('1')
      expect(await cropOf(stage(page, 'Ann'))).toEqual({ sx: 75, sy: 0, sw: 150, sh: 150 })
    })

    test('the scroll wheel zooms in and out', async ({ page }) => {
      await startCrop(page)
      const box = stage(page, 'Ann')
      const bounds = (await box.boundingBox())!
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.wheel(0, -400)
      await expect.poll(async () => Number(await box.getAttribute('data-zoom'))).toBeGreaterThan(1.1)
      await page.mouse.wheel(0, 2000)
      await expect(box).toHaveAttribute('data-zoom', '1.00')
    })

    test('the keyboard does it all: arrows move the picture, plus and minus zoom, Home resets', async ({ page }) => {
      await startCrop(page)
      const box = stage(page, 'Ann')
      await box.focus()

      // Arrow keys move the picture the way a drag would: right moves the picture right, so the frame sees more of the left.
      const start = await cropOf(box)
      await page.keyboard.press('ArrowRight')
      const right = await cropOf(box)
      expect(right.sx).toBeLessThan(start.sx)
      await page.keyboard.press('Shift+ArrowLeft')
      await page.keyboard.press('Shift+ArrowLeft')
      expect((await cropOf(box)).sx).toBeGreaterThan(right.sx)

      await page.keyboard.press('+')
      await page.keyboard.press('+')
      await expect(box).toHaveAttribute('data-zoom', '1.20')
      await page.keyboard.press('-')
      await expect(box).toHaveAttribute('data-zoom', '1.10')

      await page.keyboard.press('Home')
      await expect(box).toHaveAttribute('data-zoom', '1.00')
      expect(await cropOf(box)).toEqual(start)
    })

    test('the picture can never be moved off the circle: extreme drags and zooms keep it covered', async ({ page }) => {
      await startCrop(page)
      const box = stage(page, 'Ann')
      await cropRegion(page, 'Ann').getByRole('slider', { name: 'Zoom' }).fill('2')
      for (const [dx, dy] of [[-2000, 0], [0, 2000], [2000, -2000], [-2000, -2000]]) {
        await drag(page, box, dx, dy)
        const c = await cropOf(box)
        expect(c.sx).toBeGreaterThanOrEqual(0)
        expect(c.sy).toBeGreaterThanOrEqual(0)
        expect(c.sx + c.sw).toBeLessThanOrEqual(300)
        expect(c.sy + c.sh).toBeLessThanOrEqual(150)
      }
    })

    test('a two-finger pinch zooms in, and pinching back zooms out', async ({ page, isMobile }) => {
      test.skip(!isMobile, 'a real two-finger gesture needs the touch device')
      await startCrop(page)
      const box = stage(page, 'Ann')
      const bounds = (await box.boundingBox())!
      const cx = bounds.x + bounds.width / 2
      const cy = bounds.y + bounds.height / 2
      const cdp = await page.context().newCDPSession(page)
      const touch = (type: string, spread: number) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints:
            type === 'touchEnd'
              ? []
              : [
                  { x: cx - spread, y: cy, id: 1 },
                  { x: cx + spread, y: cy, id: 2 },
                ],
        })
      await touch('touchStart', 30)
      for (const spread of [40, 55, 70, 85, 100]) await touch('touchMove', spread)
      await touch('touchEnd', 0)
      await expect.poll(async () => Number(await box.getAttribute('data-zoom'))).toBeGreaterThan(2)

      await touch('touchStart', 100)
      for (const spread of [80, 60, 40, 20, 10]) await touch('touchMove', spread)
      await touch('touchEnd', 0)
      await expect.poll(async () => Number(await box.getAttribute('data-zoom'))).toBeLessThan(1.6)
    })
  })

  test.describe('crop errors', () => {
    test('a file that is not a picture never reaches the crop step', async ({ page }) => {
      const dialog = await openAvatarEditor(page, 'Ann')
      await dialog.getByLabel('Choose a photo file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
      await expect(dialog.getByRole('alert')).toContainText('not a picture')
      await expect(page.getByTestId('crop-stage')).toHaveCount(0)
    })

    test('a file that only claims to be a picture never reaches the crop step', async ({ page }) => {
      const dialog = await openAvatarEditor(page, 'Ann')
      await dialog.getByLabel('Choose a photo file').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('nope') })
      await expect(dialog.getByRole('alert')).toContainText('could not be read')
      await expect(page.getByTestId('crop-stage')).toHaveCount(0)
    })

    test('the emoji and colour choices still work after cropping, and replace the photo', async ({ page }) => {
      await startCrop(page)
      await cropRegion(page, 'Ann').getByRole('button', { name: 'Use photo' }).click()
      const editor = page.getByRole('dialog', { name: 'Avatar for Ann' })
      await expect(avatarOf(editor, 'Ann')).toHaveAttribute('data-avatar-kind', 'photo')
      await editor.getByRole('button', { name: 'Emoji 🎾' }).click()
      await expect(avatarOf(editor, 'Ann')).toHaveAttribute('data-emoji', '🎾')
    })

    test('cropping again after a saved photo starts from the new picture, not the old crop', async ({ page }) => {
      await startCrop(page)
      await drag(page, stage(page, 'Ann'), -400)
      await cropRegion(page, 'Ann').getByRole('button', { name: 'Use photo' }).click()
      await page.getByRole('dialog', { name: 'Avatar for Ann' }).getByLabel('Choose a photo file').setInputFiles({ name: 'again.png', mimeType: 'image/png', buffer: PICTURE })
      expect(await cropOf(stage(page, 'Ann'))).toEqual({ sx: 75, sy: 0, sw: 150, sh: 150 })
    })
  })
})
