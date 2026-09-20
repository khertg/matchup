import { expect, type Page } from '@playwright/test'

/** Open a shadcn Select by its label and pick an option by name. */
export async function choose(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByLabel(label).click()
  // Exact match so "Male" does not also match "Female".
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click()
}

/** Fill the setup form and start a session. */
export async function startSession(
  page: Page,
  {
    location = 'Test Club',
    courts = 1,
    mode = 'Doubles',
    gameMinutes = 12,
    matchmaking,
  }: {
    location?: string
    courts?: number
    mode?: 'Doubles' | 'Singles'
    gameMinutes?: number
    /** Option label, e.g. 'Mixed doubles'. Defaults to Auto-balanced. */
    matchmaking?: string
  } = {},
) {
  await page.goto('/')
  await page.getByLabel('Location').fill(location)
  await page.getByLabel('Number of courts (1 to 15)').fill(String(courts))
  await page.getByRole('button', { name: mode }).click()
  if (matchmaking) await choose(page, 'Matchmaking', matchmaking)
  await page.getByLabel('Average game length (minutes)').fill(String(gameMinutes))
  await page.getByRole('button', { name: 'Start session' }).click()
  await expect(page.getByRole('heading', { name: location })).toBeVisible()
}

export interface PlayerSpec {
  name: string
  gender?: 'Male' | 'Female'
  /** Option text such as '5 · Advanced'. */
  skill?: string
}

/** Check players in from the Check-in tab, then return to the Board tab. */
export async function checkIn(page: Page, players: (string | PlayerSpec)[]) {
  await page.getByRole('tab', { name: 'Check-in' }).click()
  for (const entry of players) {
    const player = typeof entry === 'string' ? { name: entry } : entry
    await page.getByLabel('Player name').fill(player.name)
    if (player.skill) await choose(page, 'Skill level', player.skill)
    if (player.gender) await choose(page, /^Gender/, player.gender)
    await page.getByRole('button', { name: 'Check in', exact: true }).click()
    await expect(page.getByText(`${player.name} checked in`)).toBeVisible()
  }
  await page.getByRole('tab', { name: 'Board' }).click()
}
