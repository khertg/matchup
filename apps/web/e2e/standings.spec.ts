import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { checkIn, openSessionMenu, startGame, startSession, recordWin } from './helpers'

/** Singles on one court: Ann is always Blue, so "Blue won" makes Ann win every time. */
async function singlesWithGames(page: Page, teamAWins: number) {
  await startSession(page, { mode: 'Singles' })
  await checkIn(page, ['Ann', 'Bob'])
  for (let i = 0; i < teamAWins; i++) {
    await startGame(page)
    await recordWin(page)
    await expect(page.getByText('Court 1: Blue won').first()).toBeVisible()
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

test('shows each player\'s total wait before their games', async ({ page }) => {
  await page.clock.install()
  await startSession(page, { mode: 'Singles' })
  await checkIn(page, ['Ann', 'Bob'])
  await page.clock.fastForward('05:00')
  await startGame(page)
  await recordWin(page)
  await page.clock.fastForward('03:00')
  await startGame(page)
  await recordWin(page)
  await openStandings(page)

  const rows = page.getByRole('table').first().getByRole('row')
  await expect(rows.first().getByRole('columnheader').nth(9)).toHaveText('Wait')
  // 8 minutes, plus the few real seconds the clicks took.
  await expect(rows.nth(1).getByRole('cell').nth(9)).toHaveText(/^8m(\d+s)?$/)
  await expect(rows.nth(2).getByRole('cell').nth(9)).toHaveText(/^8m(\d+s)?$/)
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

/** A real looping animated GIF: its signature, many frames, and the loop-forever marker. */
function expectAnimatedGif(bytes: Buffer) {
  expect(bytes.subarray(0, 6).toString('ascii')).toBe('GIF89a')
  // Each frame starts with a graphic control block.
  expect(bytes.toString('latin1').split('!ù').length - 1).toBeGreaterThan(20)
  const loop = bytes.indexOf('NETSCAPE2.0')
  expect(loop).toBeGreaterThan(0)
  expect(bytes.readUInt16LE(loop + 13)).toBe(0)
}

test('downloads an animated stats card', async ({ page }) => {
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
  expect(download.suggestedFilename()).toBe('ann-q2dink-stats.gif')
  expectAnimatedGif(readFileSync(await download.path()))
  if (process.env.STATS_GIF) await download.saveAs(process.env.STATS_GIF)
})

test('downloads the whole standings as one animated image', async ({ page }) => {
  await singlesWithGames(page, 1)
  await openStandings(page)
  await page.getByRole('button', { name: 'Share standings' }).click()

  const dialog = page.getByRole('dialog', { name: 'Share standings' })
  await expect(dialog.getByText('An animated image of the standings, ready for a group chat.')).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download image' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('q2dink-standings.gif')

  expectAnimatedGif(readFileSync(await download.path()))
  if (process.env.STANDINGS_GIF) await download.saveAs(process.env.STANDINGS_GIF)
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
  test.setTimeout(120_000)
  await singlesWithGames(page, 1)
  // Simulate 25 more players having finished a game, so the whole roster is 27: too many for one image.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('q2dink-session')!)
    const session = saved.state.session
    for (let i = 1; i <= 25; i++) {
      const id = 1000 + i
      session.players[id] = { id, name: `Extra${i}`, skill: 3 }
      session.stats[id] = { games: 1, wins: 1, losses: 0, opponentSkill: 3, pointsFor: 0, pointsAgainst: 0, scoredGames: 0, secondsPlayed: 0, secondsWaited: 0 }
    }
    localStorage.setItem('q2dink-session', JSON.stringify(saved))
  })
  await page.reload()
  await openStandings(page)
  await page.getByRole('button', { name: 'Share standings' }).click()

  const dialog = page.getByRole('dialog', { name: 'Share standings' })
  await expect(dialog.getByText('3 animated images of up to 10 players each, ready for a group chat.')).toBeVisible()
  // Three animations take a while to prepare.
  await expect(dialog.getByRole('button', { name: 'Download 3 images' })).toBeEnabled({ timeout: 60_000 })
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
  expect(download.suggestedFilename()).toBe('q2dink-standings.gif')
})

/**
 * Browsers open the share sheet only while the tap still counts (a few seconds). Record whether it did
 * when sharing started, and what was shared.
 */
async function recordShares(page: Page) {
  await page.addInitScript(() => {
    const calls: { active: boolean; types: string[] }[] = []
    Object.assign(window, { shareCalls: calls })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: async (data: ShareData) => {
        calls.push({ active: navigator.userActivation.isActive, types: (data.files ?? []).map((f) => f.type) })
      },
      configurable: true,
    })
  })
}

const shareCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { shareCalls: { active: boolean; types: string[] }[] }).shareCalls)

test('shares the animated standings straight from the tap, with the GIF ready beforehand', async ({ page }) => {
  await recordShares(page)
  await singlesWithGames(page, 1)
  await openStandings(page)
  await page.getByRole('button', { name: 'Share standings' }).click()
  const dialog = page.getByRole('dialog', { name: 'Share standings' })
  const share = dialog.getByRole('button', { name: 'Share standings' })
  // Made while the dialog is open, before anyone taps Share.
  await expect(dialog.getByRole('button', { name: 'Preparing animation…' })).toBeDisabled()
  await expect(share).toBeEnabled({ timeout: 20_000 })

  await share.click()
  await expect.poll(async () => (await shareCalls(page)).length).toBe(1)
  expect((await shareCalls(page))[0]).toEqual({ active: true, types: ['image/gif'] })
})

test('shares the animated stats card straight from the tap, with the GIF ready beforehand', async ({ page }) => {
  await recordShares(page)
  await singlesWithGames(page, 1)
  await openStandings(page)
  await page.getByRole('button', { name: 'Share card for Ann' }).click()
  const dialog = page.getByRole('dialog', { name: 'Stats card' })
  await expect(dialog.getByRole('button', { name: 'Preparing animation…' })).toBeDisabled()
  const share = dialog.getByRole('button', { name: 'Share card' })
  await expect(share).toBeEnabled({ timeout: 20_000 })

  await share.click()
  await expect.poll(async () => (await shareCalls(page)).length).toBe(1)
  expect((await shareCalls(page))[0]).toEqual({ active: true, types: ['image/gif'] })
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
  expect(download.suggestedFilename()).toBe('ann-q2dink-stats.gif')
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

test.describe('podium', () => {
  /** Singles on three courts; Court 1 wins by the most, so Ann, Cy and Eve take gold, silver and bronze. */
  async function threeWinners(page: Page) {
    await startSession(page, { mode: 'Singles', courts: 3 })
    await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee', 'Eve', 'Fay'])
    for (const court of ['Court 1', 'Court 2', 'Court 3']) await startGame(page, court)
    await recordWin(page, 'Court 1', 'A', [11, 2])
    await recordWin(page, 'Court 2', 'A', [11, 5])
    await recordWin(page, 'Court 3', 'A', [11, 9])
    await openStandings(page)
  }

  test('shows the top three in their places, and adds no text that matches a player twice', async ({ page }) => {
    await threeWinners(page)
    const places = page.getByRole('list', { name: 'Podium' }).getByRole('listitem')
    await expect(places).toHaveCount(3)
    await expect(page.getByRole('listitem', { name: /^1st place: Ann, 1 win 0 losses/ })).toBeVisible()
    await expect(page.getByRole('listitem', { name: /^2nd place: Cy,/ })).toBeVisible()
    await expect(page.getByRole('listitem', { name: /^3rd place: Eve,/ })).toBeVisible()
    // Names and numbers on the podium are drawn from data attributes, not page text, so looking a player
    // up by name still finds only their row.
    expect(await page.getByRole('list', { name: 'Podium' }).evaluate((el) => el.textContent)).toBe('')
  })

  test('rises in and glows, and stays still for reduced motion', async ({ page }) => {
    await threeWinners(page)
    const podium = page.getByRole('list', { name: 'Podium' })
    const running = () => podium.evaluate((el) => el.getAnimations({ subtree: true }).length)
    expect(await running()).toBeGreaterThan(0)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('tab', { name: 'Board' }).click()
    await openStandings(page)
    expect(await podium.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0)
  })
})
