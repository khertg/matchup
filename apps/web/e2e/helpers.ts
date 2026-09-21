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
  /** Option text such as '5 · Advanced (4.0-4.5)'. */
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

/** Press Start game on a court and wait for the game to be on it. Games never start by themselves. */
export async function startGame(page: Page, courtName = 'Court 1') {
  const court = page.getByRole('region', { name: courtName, exact: true })
  await court.getByRole('button', { name: 'Start game' }).click()
  await expect(court.getByText('In play')).toBeVisible()
}

/**
 * Finish the game on a court: press the winner's button, then give the score the pop-up asks for.
 * Games are always finished with a score. The winner scores 11 and the other team 5 unless told.
 */
export async function recordWin(
  page: Page,
  courtName = 'Court 1',
  winner: 'A' | 'B' = 'A',
  score?: [teamA: number, teamB: number],
) {
  const [a, b] = score ?? (winner === 'A' ? [11, 5] : [5, 11])
  await page
    .getByRole('region', { name: courtName, exact: true })
    .getByRole('button', { name: `Team ${winner} won` })
    .click()
  const dialog = page.getByRole('dialog', { name: `Team ${winner} won` })
  await dialog.getByLabel('Team A score').fill(String(a))
  await dialog.getByLabel('Team B score').fill(String(b))
  await dialog.getByRole('button', { name: 'Record score' }).click()
  await expect(dialog).toHaveCount(0)
}

/** Cancel the game on a court, confirming the question it asks first. */
export async function cancelGame(page: Page, courtName = 'Court 1') {
  await page
    .getByRole('region', { name: courtName, exact: true })
    .getByRole('button', { name: 'Cancel game' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Cancel this game?' })
  await dialog.getByRole('button', { name: 'Cancel game' }).click()
  await expect(dialog).toHaveCount(0)
}
