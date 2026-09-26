import { expect, test, type Page } from '@playwright/test'
import { checkIn, openEndSessionDialog, startSession } from './helpers'

/** The last button on the setup screen. On a phone the toasts left by ending a session cover it: a reload clears them. */
async function openReset(page: Page) {
  await page.reload()
  await page.getByRole('button', { name: 'Reset this device' }).click()
}

async function endSession(page: Page) {
  await openEndSessionDialog(page)
  await page.getByRole('dialog').getByRole('button', { name: 'End session' }).click()
  await expect(page.getByText('Set up an open play session')).toBeVisible()
}

test('resets the device: saved players and past sessions are gone, display preferences stay', async ({ page }) => {
  await startSession(page, { location: 'Before reset' })
  await checkIn(page, ['Ann'])
  await endSession(page)
  await page.evaluate(() => localStorage.setItem('theme', 'dark'))

  await openReset(page)
  const dialog = page.getByRole('dialog', { name: 'Reset this device?' })
  await expect(dialog).toContainText('This cannot be undone')
  // A build with no cloud has nothing waiting to be sent: nothing listed as lost.
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Reset this device' }).click()

  await expect(page.getByText('Set up an open play session')).toBeVisible()
  await page.getByRole('button', { name: 'Past sessions' }).click()
  await expect(page.getByText('No past sessions yet.')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Saved players' }).click()
  await expect(page.getByRole('dialog').getByText('No saved players yet.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark')
})

test('Cancel keeps everything', async ({ page }) => {
  await startSession(page, { location: 'Kept' })
  await checkIn(page, ['Ann'])
  await endSession(page)
  await openReset(page)
  await page.getByRole('dialog', { name: 'Reset this device?' }).getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Past sessions' }).click()
  await expect(page.getByRole('button', { name: /Kept/ })).toBeVisible()
})
