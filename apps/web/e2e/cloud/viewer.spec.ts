import { expect, test } from '@playwright/test'
import { asLive, liveSnapshot, mockCloud } from './mock'

test.describe('live viewer', () => {
  test('shows the courts, queue and standings without staff controls', async ({ page }) => {
    await mockCloud(page, { live: asLive(liveSnapshot) })
    await page.goto('/club/sunset')

    await expect(page.getByRole('heading', { name: 'Sunset Courts' })).toBeVisible()
    await expect(page.getByText('Live', { exact: true })).toBeVisible()
    await expect(page.getByText('Skill-separated')).toBeVisible()

    const court1 = page.getByRole('region', { name: 'Court 1' })
    await expect(court1.getByText('In play')).toBeVisible()
    for (const name of ['Ann', 'Bob', 'Cy', 'Dee']) await expect(court1.getByText(name)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Court 2' }).getByText('Open')).toBeVisible()

    await expect(page.getByText('Queue (2)')).toBeVisible()
    await expect(page.getByText('Eve')).toBeVisible()
    await expect(page.getByLabel('Locked with Fay')).toBeVisible()

    // Players can look but not touch.
    await expect(page.getByRole('button', { name: /won$/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Replace/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancel game' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'End session' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Check-in' })).toHaveCount(0)
  })

  test('shows standings with medals and no share buttons', async ({ page }) => {
    await mockCloud(page, { live: asLive(liveSnapshot) })
    await page.goto('/club/sunset')
    await page.getByRole('tab', { name: 'Standings' }).click()

    const rows = page.getByRole('row')
    await expect(rows.nth(1)).toContainText('Gold medal')
    await expect(rows.nth(1)).toContainText('100%')
    await expect(page.getByRole('button', { name: /^Share card/ })).toHaveCount(0)
  })

  test('explains when no session is running', async ({ page }) => {
    await mockCloud(page, { live: null })
    await page.goto('/club/sunset')
    await expect(page.getByText('No game in progress')).toBeVisible()
  })

  test('rejects an invalid club link', async ({ page }) => {
    await mockCloud(page)
    await page.goto('/club/NOT_VALID')
    await expect(page.getByText(/That club link isn.t valid/)).toBeVisible()
  })

  test('refuses to render data it does not understand', async ({ page }) => {
    await mockCloud(page, { live: asLive({ ...liveSnapshot, schemaVersion: 99 }) })
    await page.goto('/club/sunset')
    await expect(page.getByText('This board needs a newer version of Matchup')).toBeVisible()
    await expect(page.getByText('Ann')).toHaveCount(0)
  })

  test('updates by itself when the club changes the board', async ({ page }) => {
    const mock = await mockCloud(page, { live: asLive(liveSnapshot) })
    await page.clock.install()
    await page.goto('/club/sunset')
    await expect(page.getByText('Queue (2)')).toBeVisible()

    // The club moves a game along: court 2 fills from the queue.
    mock.live = asLive({
      ...liveSnapshot,
      courts: [liveSnapshot.courts[0], { id: 2, teams: [[5, 6], [1, 2]] }],
      queue: [],
    })
    await page.clock.runFor(16_000)

    await expect(page.getByRole('region', { name: 'Court 2' }).getByText('In play')).toBeVisible()
    await expect(page.getByText('No one waiting')).toBeVisible()
  })

  test('goes back to "no game" when the club ends the session', async ({ page }) => {
    const mock = await mockCloud(page, { live: asLive(liveSnapshot) })
    await page.clock.install()
    await page.goto('/club/sunset')
    await expect(page.getByRole('heading', { name: 'Sunset Courts' })).toBeVisible()

    mock.live = null
    await page.clock.runFor(16_000)
    await expect(page.getByText('No game in progress')).toBeVisible()
  })

  test('keeps the last board on screen and says so when the connection drops', async ({ page }) => {
    const mock = await mockCloud(page, { live: asLive(liveSnapshot) })
    await page.clock.install()
    await page.goto('/club/sunset')
    await expect(page.getByRole('heading', { name: 'Sunset Courts' })).toBeVisible()

    mock.down = true
    // The Supabase client retries failed reads with backoff timers, which this fake
    // clock freezes, so keep advancing it until the failure surfaces.
    await expect(async () => {
      await page.clock.runFor(5_000)
      await expect(page.getByText(/Offline\. Showing the update from/)).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'Sunset Courts' })).toBeVisible()

    mock.down = false
    await expect(async () => {
      await page.clock.runFor(5_000)
      await expect(page.getByText(/^Updated /)).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 20_000 })
  })

  test('is usable on a phone without horizontal scrolling', async ({ page }) => {
    await mockCloud(page, { live: asLive(liveSnapshot) })
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/club/sunset')
    await expect(page.getByRole('heading', { name: 'Sunset Courts' })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
