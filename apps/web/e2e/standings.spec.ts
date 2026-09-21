import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { checkIn, startGame, startSession } from './helpers'

/** Singles on one court: Ann is always Team A, so "Team A won" makes Ann win every time. */
async function singlesWithGames(page: Page, teamAWins: number) {
  await startSession(page, { mode: 'Singles' })
  await checkIn(page, ['Ann', 'Bob'])
  const court = page.getByRole('region', { name: 'Court 1' })
  for (let i = 0; i < teamAWins; i++) {
    await startGame(page)
    await court.getByRole('button', { name: 'Team A won' }).click()
    await expect(page.getByText('Court 1: Team A won').first()).toBeVisible()
  }
}

async function openStandings(page: Page) {
  await page.getByRole('tab', { name: 'Standings' }).click()
}

test('shows an empty state before the first result', async ({ page }) => {
  await startSession(page, { mode: 'Singles' })
  await openStandings(page)
  await expect(page.getByText('No games played yet.')).toBeVisible()
})

test('ranks players by wins and awards medals', async ({ page }) => {
  await singlesWithGames(page, 2)
  await openStandings(page)

  const rows = page.getByRole('row')
  await expect(rows).toHaveCount(3) // header + two players
  await expect(rows.nth(1)).toContainText('Ann')
  await expect(rows.nth(1)).toContainText('Gold medal')
  await expect(rows.nth(1).getByRole('cell').nth(2)).toHaveText('2') // games played
  await expect(rows.nth(1).getByRole('cell').nth(3)).toHaveText('2') // wins
  await expect(rows.nth(1)).toContainText('100%')
  await expect(rows.nth(2)).toContainText('Bob')
  await expect(rows.nth(2)).toContainText('Silver medal')
  await expect(rows.nth(2)).toContainText('0%')
})

test('removes an undone result from the standings', async ({ page }) => {
  await singlesWithGames(page, 1)
  await page.getByRole('button', { name: 'Undo' }).click()
  await openStandings(page)
  await expect(page.getByText('No games played yet.')).toBeVisible()
})

test('saves results to the lifetime leaderboard when ending the session', async ({ page }) => {
  await singlesWithGames(page, 2)
  await page.getByRole('button', { name: 'End session' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Ann')).toBeVisible()
  await expect(dialog.getByText('Gold medal')).toBeVisible()
  await dialog.getByRole('button', { name: 'Save and end session' }).click()

  await expect(page.getByText('Set up an open play session')).toBeVisible()
  await page.getByRole('button', { name: 'Lifetime leaderboard' }).click()
  const board = page.getByRole('dialog')
  const ann = board.getByRole('row').filter({ hasText: 'Ann' })
  await expect(ann).toContainText('100%')
  await expect(ann.getByRole('cell').nth(2)).toHaveText('2')
  await expect(board.getByRole('row').filter({ hasText: 'Bob' })).toContainText('0%')
})

test('does not save results when ending without saving', async ({ page }) => {
  await singlesWithGames(page, 1)
  await page.getByRole('button', { name: 'End session' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'End without saving' }).click()

  await expect(page.getByText('Set up an open play session')).toBeVisible()
  await page.getByRole('button', { name: 'Lifetime leaderboard' }).click()
  await expect(page.getByText(/No players with 1 or more saved games yet/)).toBeVisible()
})

test('filters the lifetime leaderboard by minimum games and validates the input', async ({ page }) => {
  await singlesWithGames(page, 2)
  await page.getByRole('button', { name: 'End session' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save and end session' }).click()

  await page.getByRole('button', { name: 'Lifetime leaderboard' }).click()
  const board = page.getByRole('dialog')
  await expect(board.getByRole('row').filter({ hasText: 'Ann' })).toBeVisible()

  await board.getByLabel(/Minimum games/).fill('3')
  await expect(board.getByText(/No players with 3 or more saved games yet/)).toBeVisible()

  await board.getByLabel(/Minimum games/).fill('51')
  await expect(board.getByText('Enter a whole number from 1 to 50.')).toBeVisible()
})

test('downloads a stats card image', async ({ page }) => {
  await singlesWithGames(page, 1)
  await openStandings(page)
  await page.getByRole('button', { name: 'Share card for Ann' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Stats card')).toBeVisible()
  await expect(dialog.getByText('Gold medal')).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download image' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('ann-matchup-stats.png')

  // A real PNG starts with the PNG signature.
  const bytes = readFileSync(await download.path())
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  expect(bytes.length).toBeGreaterThan(2000)
})
