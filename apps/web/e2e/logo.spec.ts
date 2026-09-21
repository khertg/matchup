import { expect, test } from '@playwright/test'
import { checkIn, recordWin, startGame, startSession } from './helpers'
import { TINY_PNG, avatarOf, setLogo } from './avatarHelpers'

const logo = (page: import('@playwright/test').Page) => page.getByTestId('club-logo')

test.describe('the club logo', () => {
  test('is not there until one is added, and the app looks as it always did', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Set up an open play session')).toBeVisible()
    await expect(logo(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add club logo' })).toBeVisible()
  })

  test('is added from the setup screen and shown there, in the session header, and after ending', async ({ page }) => {
    await page.goto('/')
    await setLogo(page)
    await expect(logo(page)).toBeVisible()
    await expect(logo(page)).toHaveAttribute('src', /^data:image\/(webp|png|jpeg);base64,/)
    await expect(page.getByRole('button', { name: 'Change club logo' })).toBeVisible()

    await startSession(page, { location: 'Logo Night' })
    await expect(page.getByRole('heading', { name: 'Logo Night' })).toBeVisible()
    await expect(logo(page)).toBeVisible()

    await page.getByRole('button', { name: 'End session' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /^(Save and end session|End session)$/ }).click()
    await expect(page.getByText('Set up an open play session')).toBeVisible()
    await expect(logo(page)).toBeVisible()
  })

  test('is kept small and in its own shape', async ({ page }) => {
    await page.goto('/')
    await setLogo(page)
    const src = await logo(page).getAttribute('src')
    expect((src!.length * 3) / 4).toBeLessThan(128 * 1024)
    const size = await logo(page).evaluate((img) => [(img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight])
    expect(size).toEqual([1, 1]) // a 1x1 picture stays 1x1: logos are fitted, never stretched to a square
  })

  test('survives a reload', async ({ page }) => {
    await page.goto('/')
    await setLogo(page)
    await page.reload()
    await expect(logo(page)).toBeVisible()
  })

  test('can be changed and removed', async ({ page }) => {
    await page.goto('/')
    await setLogo(page)
    const first = await logo(page).getAttribute('src')

    // A different picture replaces it.
    await page.getByRole('button', { name: 'Change club logo' }).click()
    const dialog = page.getByRole('dialog', { name: 'Club logo' })
    await expect(dialog.getByRole('img', { name: 'Current club logo' })).toBeVisible()
    const other = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGBgYGBAQAOAgEBOJ0iMQAAAABJRU5ErkJggg==',
      'base64',
    )
    await dialog.getByLabel('Choose a logo file').setInputFiles({ name: 'other.png', mimeType: 'image/png', buffer: other })
    await page.getByRole('dialog', { name: 'Crop club logo' }).getByRole('button', { name: 'Use whole picture' }).click()
    await expect(page.getByText('Club logo updated').last()).toBeVisible()
    await expect.poll(() => logo(page).getAttribute('src')).not.toBe(first)

    await dialog.getByRole('button', { name: 'Remove logo' }).click()
    await expect(page.getByText('Club logo removed')).toBeVisible()
    await expect(logo(page)).toHaveCount(0)
    await expect(dialog.getByText('No logo yet.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Remove logo' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Add club logo' })).toBeVisible()
  })

  test('refuses a file that is not a picture, and keeps the logo', async ({ page }) => {
    await page.goto('/')
    await setLogo(page)
    await page.getByRole('button', { name: 'Change club logo' }).click()
    const dialog = page.getByRole('dialog', { name: 'Club logo' })
    await dialog.getByLabel('Choose a logo file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await expect(dialog.getByRole('alert')).toContainText('not a picture')
    await page.keyboard.press('Escape')
    await expect(logo(page)).toBeVisible()
  })

  test('offers the camera as well as a file', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Add club logo' }).click()
    const dialog = page.getByRole('dialog', { name: 'Club logo' })
    await expect(dialog.getByRole('button', { name: 'Take photo' })).toBeVisible()
    await expect(dialog.getByLabel('Take a photo of the logo')).toHaveAttribute('capture', 'environment')
    await dialog.getByLabel('Take a photo of the logo').setInputFiles({ name: 'camera.png', mimeType: 'image/png', buffer: TINY_PNG })
    await page.getByRole('dialog', { name: 'Crop club logo' }).getByRole('button', { name: 'Use whole picture' }).click()
    await expect(page.getByText('Club logo updated')).toBeVisible()
  })

  test('is on the stats card players share, with their avatar', async ({ page }) => {
    await page.goto('/')
    await setLogo(page)
    await startSession(page, { mode: 'Singles' })
    await checkIn(page, ['Ann', 'Bob'])
    await startGame(page)
    await recordWin(page)
    await page.getByRole('tab', { name: 'Standings' }).click()
    await page.getByRole('button', { name: 'Share card for Ann' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('club-logo')).toBeVisible()
    await expect(avatarOf(dialog, 'Ann')).toBeVisible()
  })
})
