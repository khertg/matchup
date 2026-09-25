import { expect, test } from '@playwright/test'
import { startSession } from './helpers'

// The default build has no API configured (VITE_API_URL), so every cloud feature must stay out of the way.

test('hides the cloud club panel on the setup screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Set up an open play session')).toBeVisible()
  await expect(page.getByText('Cloud club')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create a club' })).toHaveCount(0)
})

test('shows no sync badge or share button during a session', async ({ page }) => {
  await startSession(page)
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Share live view' })).toHaveCount(0)
})

test('explains that the live view is unavailable', async ({ page }) => {
  await page.goto('/club/sunset/live')
  await expect(page.getByText('Live view is not available')).toBeVisible()
  await expect(page.getByText(/Cloud sync isn.t configured/)).toBeVisible()
})

test('rejects an invalid club link', async ({ page }) => {
  await page.goto('/club/NOT_VALID/live')
  await expect(page.getByText(/That club link isn.t valid/)).toBeVisible()
})
