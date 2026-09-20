import { expect, type Page } from '@playwright/test'

/** Fill the setup form and start a session. */
export async function startSession(
  page: Page,
  { location = 'Test Club', courts = 1, mode = 'Doubles' } = {},
) {
  await page.goto('/')
  await page.getByLabel('Location').fill(location)
  await page.getByLabel('Number of courts (1 to 15)').fill(String(courts))
  await page.getByRole('button', { name: mode }).click()
  await page.getByRole('button', { name: 'Start session' }).click()
  await expect(page.getByRole('heading', { name: location })).toBeVisible()
}

/** Check players in from the Check-in tab, then return to the Board tab. */
export async function checkIn(page: Page, names: string[]) {
  await page.getByRole('tab', { name: 'Check-in' }).click()
  for (const name of names) {
    await page.getByLabel('Player name').fill(name)
    await page.getByRole('button', { name: 'Check in', exact: true }).click()
    await expect(page.getByText(`${name} checked in`)).toBeVisible()
  }
  await page.getByRole('tab', { name: 'Board' }).click()
}
