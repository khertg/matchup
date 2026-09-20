import { expect, test } from '@playwright/test'

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('follows a dark system preference', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})

test.describe('light mode', () => {
  test.use({ colorScheme: 'light' })

  test('follows a light system preference', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start session' })).toBeVisible()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })
})
