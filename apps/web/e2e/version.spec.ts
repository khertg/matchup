import { expect, test, type Page } from '@playwright/test'
import { checkIn, startSession } from './helpers'

const VERSION = /^v\d+\.\d+\.\d+$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Clicks the version and checks the popover lists this build's commit and time (read from the title). */
async function expectBuildDetails(page: Page) {
  const label = page.getByTestId('app-version')
  const title = (await label.getAttribute('title'))!
  const [, commit, built] = /commit (\S+), built (\S+)$/.exec(title)!
  await label.click()
  const details = page.getByTestId('app-build-details')
  await expect(details).toBeVisible()
  if (commit === 'dev') {
    await expect(details).toHaveText('dev')
  } else {
    await expect(details).toContainText(commit)
    // Shown in the browser's time zone, which is the one this test runs in.
    const at = new Date(built)
    const hours = at.getHours()
    const time = `${hours % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
    await expect(details).toContainText(`${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}, ${time}`)
  }
  await page.keyboard.press('Escape')
  await expect(details).toBeHidden()
}

test.describe('version number', () => {
  test('is shown on the setup screen, as the release only', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Set up an open play session')).toBeVisible()
    await expect(page.getByTestId('app-version')).toHaveText(VERSION)
  })

  test('shows the commit and build date when clicked', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('app-build-details')).toHaveCount(0)
    await expectBuildDetails(page)
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
    // Fits the bar without spilling past the screen edge.
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    await expectBuildDetails(page)
  })

  test('says which build it is when hovered, with the full details', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('app-version')).toHaveAttribute('title', /^Q2Dink \d+\.\d+\.\d+, commit \S+, built \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  test('the same version is shown on every screen of one build', async ({ page }) => {
    await page.goto('/')
    const setup = await page.getByTestId('app-version').textContent()
    await startSession(page)
    expect(await page.getByTestId('app-version').textContent()).toBe(setup)
  })
})
