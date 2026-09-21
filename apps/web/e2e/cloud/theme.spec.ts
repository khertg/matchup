import { expect, test } from '@playwright/test'
import { failOnCspViolations } from '../cspWatch'
import { apiCreateClub, apiPublish, uiLogin, uniqueClub, expectSignedIn } from './support'

failOnCspViolations(test)

test.use({ colorScheme: 'light' })

async function chooseDark(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Colour theme' }).click()
  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
}

test.describe('theme switch with the cloud', () => {
  test('is on the login screen, and the choice carries on after logging in', async ({ page, request }) => {
    const club = uniqueClub('Theme')
    await apiCreateClub(request, club)
    await page.goto('/')
    await expect(page.getByText('Log in to your club to use Matchup')).toBeVisible()
    await chooseDark(page)
    await uiLogin(page, club)
    await expectSignedIn(page)
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test("is on the players' live page, which never asks for a login", async ({ page, request }) => {
    const club = uniqueClub('Live')
    const { token } = await apiCreateClub(request, club)
    await apiPublish(request, token)
    await page.goto(`/club/${club.slug}`)
    await expect(page.getByRole('heading', { name: 'Sunset Courts' })).toBeVisible()
    await chooseDark(page)
    await expect(page.getByRole('heading', { name: 'Sunset Courts' })).toBeVisible()
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('the theme script is served from the site itself under the production Content-Security-Policy', async ({ page }) => {
    const response = await page.goto('/theme-init.js')
    expect(response?.status()).toBe(200)
    expect(response?.headers()['content-type']).toMatch(/javascript/)
  })
})
