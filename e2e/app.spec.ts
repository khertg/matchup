import { expect, test } from '@playwright/test'

test('renders the home screen', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Matchup')
  await expect(page.getByText('Pickleball open play manager')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start session' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check in players' })).toBeVisible()
})

test('shows a toast when a session is started', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start session' }).click()
  await expect(page.getByText('Court 1 is ready')).toBeVisible()
})

test('loads without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Start session' })).toBeVisible()

  expect(errors).toEqual([])
})
