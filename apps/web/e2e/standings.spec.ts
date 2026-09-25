import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { checkIn, openSessionMenu, startGame, startSession, recordWin } from './helpers'

/** Singles on one court: Ann is always Team A, so "Team A won" makes Ann win every time. */
async function singlesWithGames(page: Page, teamAWins: number) {
  await startSession(page, { mode: 'Singles' })
  await checkIn(page, ['Ann', 'Bob'])
  for (let i = 0; i < teamAWins; i++) {
    await startGame(page)
    await recordWin(page)
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

  const rows = page.getByRole('table').first().getByRole('row')
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
  await openSessionMenu(page)
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

test('filters the lifetime leaderboard by minimum games and validates the input', async ({ page }) => {
  await singlesWithGames(page, 2)
  await openSessionMenu(page)
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
  // The session name is not a place: no "at Test Club". With no club it stands alone.
  await expect(dialog.getByText('Finished #1', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Test Club', { exact: true })).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download image' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('ann-q2dink-stats.png')

  // A real PNG starts with the PNG signature.
  const bytes = readFileSync(await download.path())
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  expect(bytes.length).toBeGreaterThan(2000)
})

test('downloads the whole standings as one image', async ({ page }) => {
  await singlesWithGames(page, 1)
  await openStandings(page)
  await page.getByRole('button', { name: 'Share standings' }).click()

  const dialog = page.getByRole('dialog', { name: 'Share standings' })
  await expect(dialog.getByText('An image of the standings, ready for a group chat.')).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download image' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('q2dink-standings.png')

  const bytes = readFileSync(await download.path())
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  expect(bytes.length).toBeGreaterThan(1000)
})

test.describe('image colours', () => {
  /** The shared image in a dialog (the swatches are buttons and labels, not divs). */
  const card = (dialog: ReturnType<Page['getByRole']>) => dialog.locator('div[style*="linear-gradient"]').first()
  const background = (dialog: ReturnType<Page['getByRole']>) => card(dialog).evaluate((el) => getComputedStyle(el).backgroundImage)
  const textColour = (dialog: ReturnType<Page['getByRole']>) => card(dialog).evaluate((el) => getComputedStyle(el).color)

  test('the picked preset colours the preview, is remembered, and applies to the stats card too', async ({ page }) => {
    await singlesWithGames(page, 1)
    await openStandings(page)
    await page.getByRole('button', { name: 'Share standings' }).click()
    let dialog = page.getByRole('dialog', { name: 'Share standings' })
    const colours = dialog.getByRole('radiogroup', { name: 'Colour' })
    await expect(colours.getByRole('radio', { name: 'Court' })).toHaveAttribute('aria-checked', 'true')
    expect(await background(dialog)).toContain('rgb(20, 83, 45)') // #14532d

    await colours.getByRole('radio', { name: 'Ocean' }).click()
    await expect(colours.getByRole('radio', { name: 'Ocean' })).toHaveAttribute('aria-checked', 'true')
    expect(await background(dialog)).toContain('rgb(30, 58, 138)') // #1e3a8a
    await page.keyboard.press('Escape')

    await page.reload()
    await openStandings(page)
    await page.getByRole('button', { name: 'Share card for Ann' }).click()
    dialog = page.getByRole('dialog', { name: 'Stats card' })
    await expect(dialog.getByRole('radio', { name: 'Ocean' })).toHaveAttribute('aria-checked', 'true')
    expect(await background(dialog)).toContain('rgb(30, 58, 138)')
  })

  test('a light custom colour switches the text to dark', async ({ page }) => {
    await singlesWithGames(page, 1)
    await openStandings(page)
    await page.getByRole('button', { name: 'Share standings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Share standings' })
    expect(await textColour(dialog)).toBe('rgb(255, 255, 255)')

    await dialog.getByLabel('Custom colour').fill('#fde047')
    await expect.poll(() => background(dialog)).toContain('rgb(253, 224, 71)')
    expect(await textColour(dialog)).toBe('rgb(15, 23, 42)') // #0f172a
  })
})

test('splits a large roster into several images of up to 10 players each', async ({ page }) => {
  await singlesWithGames(page, 1)
  // Simulate 25 more players having finished a game, so the whole roster is 27: too many for one image.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('q2dink-session')!)
    const session = saved.state.session
    for (let i = 1; i <= 25; i++) {
      const id = 1000 + i
      session.players[id] = { id, name: `Extra${i}`, skill: 3 }
      session.stats[id] = { games: 1, wins: 1, losses: 0, opponentSkill: 3, pointsFor: 0, pointsAgainst: 0, scoredGames: 0, secondsPlayed: 0 }
    }
    localStorage.setItem('q2dink-session', JSON.stringify(saved))
  })
  await page.reload()
  await openStandings(page)
  await page.getByRole('button', { name: 'Share standings' }).click()

  const dialog = page.getByRole('dialog', { name: 'Share standings' })
  await expect(dialog.getByText('3 images of up to 10 players each, ready for a group chat.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Download 3 images' })).toBeVisible()
})

/** Simulate a device that supports the Web Share API for files, so the primary button shares. */
async function fakeNativeShare(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: async () => {}, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
  })
}

test('offers a direct download of the whole standings even when the device could share', async ({ page }) => {
  await fakeNativeShare(page)
  await singlesWithGames(page, 1)
  await openStandings(page)
  await page.getByRole('button', { name: 'Share standings' }).click()

  const dialog = page.getByRole('dialog', { name: 'Share standings' })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download image instead' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('q2dink-standings.png')
})

test('offers a direct download of a stats card even when the device could share', async ({ page }) => {
  await fakeNativeShare(page)
  await singlesWithGames(page, 1)
  await openStandings(page)
  await page.getByRole('button', { name: 'Share card for Ann' }).click()

  const dialog = page.getByRole('dialog')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download image instead' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('ann-q2dink-stats.png')
})

test('is also offered from Past sessions', async ({ page }) => {
  await singlesWithGames(page, 1)
  await openSessionMenu(page)
  await page.getByRole('button', { name: 'End session' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save and end session' }).click()

  await page.getByRole('button', { name: 'Past sessions' }).click()
  await page.getByRole('dialog', { name: 'Past sessions' }).getByRole('button', { name: /Test Club/ }).click()
  await expect(page.getByRole('dialog', { name: 'Test Club' }).getByRole('button', { name: 'Share standings' })).toBeVisible()
})
