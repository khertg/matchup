import { expect, test } from '@playwright/test'
import { failOnCspViolations } from '../cspWatch'
import { checkIn, openEndSessionDialog, startSession } from '../helpers'
import { apiCreateClub, bearer, expectSignedIn, storedToken, uiLogin, uniqueClub } from './support'

failOnCspViolations(test)

test('resets a signed-in device: logged out, and the club’s data comes back after logging in', async ({ page, request }) => {
  const club = uniqueClub('Reset')
  await apiCreateClub(request, club)
  await page.goto('/')
  await uiLogin(page, club)
  await expectSignedIn(page)
  const token = await storedToken(page)

  await startSession(page, { location: 'Reset Night' })
  await checkIn(page, ['Ann'])
  await openEndSessionDialog(page)
  await page.getByRole('dialog').getByRole('button', { name: 'End session' }).click()
  await expect(page.getByText('Set up an open play session')).toBeVisible()
  // Wait for the club to have the ended session and the saved player.
  await expect
    .poll(async () => (await (await request.get('/api/history', { headers: bearer(token) })).json()).sessions.length)
    .toBe(1)
  await expect
    .poll(async () => (await (await request.get('/api/roster', { headers: bearer(token) })).json()).players.length)
    .toBe(1)

  await page.getByRole('button', { name: 'Reset this device' }).click()
  const dialog = page.getByRole('dialog', { name: 'Reset this device?' })
  await expect(dialog).toContainText('comes back when you log in again')
  await expect(dialog.getByRole('button', { name: 'Reset this device' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Reset this device' }).click()

  // Logged out here and on the server.
  await expect(page.getByText('Log in to your club to use Q2Dink')).toBeVisible()
  await expect.poll(async () => (await request.get('/api/history', { headers: bearer(token) })).status()).toBe(401)

  // Logging in again: the same device keeps its name, so it is not asked again, and the club's data returns.
  await uiLogin(page, club)
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
  await expect(page.getByLabel('Device name')).toHaveCount(0)
  await page.getByRole('button', { name: 'Past sessions' }).click()
  await expect(page.getByRole('button', { name: /Reset Night/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Saved players' }).click()
  await expect(page.getByRole('list', { name: 'Saved players' }).getByText('Ann')).toBeVisible({ timeout: 15_000 })
})

test('lists what would be lost when the club has not been sent it yet', async ({ page, request }) => {
  const club = uniqueClub('Unsent')
  await apiCreateClub(request, club)
  await page.goto('/')
  await uiLogin(page, club)
  await expectSignedIn(page)

  await page.context().setOffline(true)
  await page.getByRole('button', { name: 'Saved players' }).click()
  const saved = page.getByRole('dialog', { name: /^Saved players/ })
  await saved.getByLabel('Player name').fill('Zed')
  await saved.getByRole('button', { name: 'Save player' }).click()
  await expect(page.getByText('Zed saved')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Reset this device' }).click()
  const dialog = page.getByRole('dialog', { name: 'Reset this device?' })
  const lost = dialog.getByRole('alert')
  await expect(lost).toContainText('1 saved player')
  await expect(lost).toContainText('activity log entr')

  // Back online, "Try sending first" gets it to the club and nothing is listed any more.
  await page.context().setOffline(false)
  await lost.getByRole('button', { name: 'Try sending first' }).click()
  await expect(dialog.getByRole('alert')).toHaveCount(0, { timeout: 15_000 })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
})
