import { expect, test } from '@playwright/test'
import { checkIn, startSession } from './helpers'

const VERSION = /^v\d+\.\d+\.\d+ · \S+/

test.describe('version number', () => {
  test('is shown on the setup screen', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Set up an open play session')).toBeVisible()
    await expect(page.getByTestId('app-version')).toHaveText(VERSION)
  })

  test('is shown while a session is running, in the header above the bottom tab bar', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    const label = page.getByTestId('app-version')
    await expect(label).toHaveText(VERSION)
    // In the sticky header, never behind the fixed bottom tab bar.
    const box = (await label.boundingBox())!
    const tabs = (await page.getByRole('tablist').boundingBox())!
    expect(box.y).toBeLessThan(tabs.y)
  })

  test('says which build it is when hovered, with the full details', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('app-version')).toHaveAttribute('title', /^Q2Dink \d+\.\d+\.\d+, commit \S+, built \d{4}-\d{2}-\d{2}$/)
  })

  test('the same version is shown on every screen of one build', async ({ page }) => {
    await page.goto('/')
    const setup = await page.getByTestId('app-version').textContent()
    await startSession(page)
    expect(await page.getByTestId('app-version').textContent()).toBe(setup)
  })
})
