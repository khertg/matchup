import { expect, test } from '@playwright/test'
import { apiCreateClub, expectSignedIn, storedToken, uiLogin, uniqueClub } from './support'

/** A device that was logged in before the app was renamed (its login was kept under the old name) stays logged in. */
test('the staff login survives the rename, and the login screen does not appear', async ({ page, browser, request, baseURL }) => {
  const club = uniqueClub('Legacy')
  await apiCreateClub(request, club)
  await page.goto('/')
  await uiLogin(page, club)
  await expectSignedIn(page)
  const token = await storedToken(page)
  const saved = await page.evaluate(() => localStorage.getItem('q2dink-club')!)

  // A fresh browser holding only what the older version would have saved.
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' })
  const old = await context.newPage()
  await old.goto('/theme-init.js')
  await old.evaluate((value) => localStorage.setItem('matchup-club', value), saved)

  await old.goto('/')
  await expectSignedIn(old)
  await expect(old.getByText('Log in to your club to use Q2Dink')).toHaveCount(0)
  expect(await storedToken(old)).toBe(token)
  expect(await old.evaluate(() => localStorage.getItem('matchup-club'))).toBeNull()
  await context.close()
})
