import { devices, expect, test, type Page } from '@playwright/test'

const banner = (page: Page) => page.getByRole('region', { name: 'Install the app' })

/** Pretend the browser offers installation, as Chrome does; the fake prompt records that it was shown. */
async function offerInstall(page: Page) {
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>
    event.prompt = async () => {
      ;(window as unknown as { prompted: boolean }).prompted = true
    }
    event.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(event)
  })
}

test('no banner unless the browser can install the app', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Set up an open play session')).toBeVisible()
  await expect(banner(page)).toHaveCount(0)
})

test('Install opens the browser prompt and the banner goes away', async ({ page }) => {
  await page.goto('/')
  await offerInstall(page)
  await expect(banner(page)).toContainText('open it with one tap')

  await banner(page).getByRole('button', { name: 'Install' }).click()
  await expect(banner(page)).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true)
})

test('dismissing it keeps it hidden after a reload', async ({ page }) => {
  await page.goto('/')
  await offerInstall(page)
  await banner(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(banner(page)).toHaveCount(0)

  await page.reload()
  await offerInstall(page)
  await expect(page.getByText('Set up an open play session')).toBeVisible()
  await expect(banner(page)).toHaveCount(0)
})

test('never shown on the public live page', async ({ page }) => {
  await page.goto('/club/demo/live')
  await offerInstall(page)
  await expect(page.getByRole('main')).toBeVisible()
  await expect(banner(page)).toHaveCount(0)
})

test.describe('on an iPhone', () => {
  test.use({ userAgent: devices['iPhone 13'].userAgent })

  test('explains Share, then Add to Home Screen', async ({ page }) => {
    await page.goto('/')
    await expect(banner(page)).toContainText('Add to Home Screen')
    await expect(banner(page).getByRole('button', { name: 'Install' })).toHaveCount(0)
  })
})
