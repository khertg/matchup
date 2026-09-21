import { expect, test, type Page } from '@playwright/test'
import { checkIn, startGame, startSession, recordWin } from './helpers'

/** Singles on one court: Ann is Team A, so "Team A won" gives Ann the win. */
async function playOneGame(page: Page, location = 'Sunset Club') {
  await startSession(page, { location, mode: 'Singles' })
  await checkIn(page, ['Ann', 'Bob'])
  await startGame(page)
  await recordWin(page)
  await expect(page.getByText('Court 1: Team A won')).toBeVisible()
}

async function endAndSave(page: Page) {
  await page.getByRole('button', { name: 'End session' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save and end session' }).click()
  await expect(page.getByText('Set up an open play session')).toBeVisible()
}

const openPast = async (page: Page) => {
  await page.getByRole('button', { name: 'Past sessions' }).click()
  const dialog = page.getByRole('dialog', { name: 'Past sessions' })
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe('past sessions', () => {
  test('keeps an ended session, and shows how everyone ranked', async ({ page }) => {
    await playOneGame(page)
    await endAndSave(page)

    const list = await openPast(page)
    const row = list.getByRole('button', { name: /Sunset Club/ })
    await expect(row).toContainText('Singles')
    await expect(row).toContainText('2 players')
    await expect(row).toContainText('1 game')
    await row.click()

    const view = page.getByRole('dialog', { name: 'Sunset Club' })
    const rows = view.getByRole('row')
    await expect(rows.nth(1)).toContainText('Ann')
    await expect(rows.nth(1)).toContainText('Gold medal')
    await expect(rows.nth(2)).toContainText('Bob')
    // Only reading: no way to record anything from here.
    await expect(view.getByRole('button', { name: /won$/ })).toHaveCount(0)
  })

  test('lists the newest session first, and survives a reload', async ({ page }) => {
    await playOneGame(page, 'First Night')
    await endAndSave(page)
    await playOneGame(page, 'Second Night')
    await endAndSave(page)

    await page.reload()
    const list = await openPast(page)
    const rows = list.getByRole('listitem')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('Second Night')
    await expect(rows.nth(1)).toContainText('First Night')
  })

  test('says so when there is nothing yet, and never saves a session nobody joined', async ({ page }) => {
    await startSession(page, { location: 'Empty Night' })
    await page.getByRole('button', { name: 'End session' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'End session' }).click()
    await expect(page.getByText('Set up an open play session')).toBeVisible()

    const list = await openPast(page)
    await expect(list.getByText('No past sessions yet.')).toBeVisible()
  })

  test('deletes a session only after asking', async ({ page }) => {
    await playOneGame(page)
    await endAndSave(page)
    const list = await openPast(page)
    await list.getByRole('button', { name: /Sunset Club/ }).click()

    const view = page.getByRole('dialog', { name: 'Sunset Club' })
    await view.getByRole('button', { name: 'Delete', exact: true }).click()
    const confirm = view.getByRole('group', { name: 'Confirm deleting this session' })
    await confirm.getByRole('button', { name: 'Keep it' }).click()
    await expect(confirm).toHaveCount(0)

    await view.getByRole('button', { name: 'Delete', exact: true }).click()
    await confirm.getByRole('button', { name: 'Delete session' }).click()
    await expect(page.getByText('Session deleted')).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Past sessions' }).getByText('No past sessions yet.')).toBeVisible()
  })

  test('goes back from a session to the list', async ({ page }) => {
    await playOneGame(page)
    await endAndSave(page)
    const list = await openPast(page)
    await list.getByRole('button', { name: /Sunset Club/ }).click()
    await page.getByRole('dialog', { name: 'Sunset Club' }).getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('dialog', { name: 'Past sessions' })).toBeVisible()
  })
})

test.describe('resuming a session', () => {
  test('brings back the queue, the games in progress and the standings', async ({ page }) => {
    await startSession(page, { location: 'Accident', mode: 'Singles', courts: 2 })
    await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee', 'Eve'])
    await startGame(page, 'Court 1')
    await recordWin(page)
    await expect(page.getByText('Court 1: Team A won')).toBeVisible()
    await startGame(page, 'Court 2') // Cy v Dee is on court when it ends
    await page.getByRole('button', { name: 'End session' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Save and end session' }).click()
    await expect(page.getByText('Set up an open play session')).toBeVisible()

    const list = await openPast(page)
    await list.getByRole('button', { name: /Accident/ }).click()
    await page.getByRole('dialog', { name: 'Accident' }).getByRole('button', { name: 'Resume this session' }).click()

    await expect(page.getByRole('heading', { name: 'Accident' })).toBeVisible()
    await expect(page.getByText('“Accident” is running again')).toBeVisible()
    const court2 = page.getByRole('region', { name: 'Court 2' })
    await expect(court2.getByText('In play')).toBeVisible()
    await expect(court2.getByText('Cy')).toBeVisible()
    await expect(court2.getByText('Dee')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Court 1' }).getByText('Open')).toBeVisible()
    await expect(page.getByText('Queue (3)')).toBeVisible()

    await page.getByRole('tab', { name: 'Standings' }).click()
    await expect(page.getByRole('row').nth(1)).toContainText('Ann')
    await expect(page.getByRole('row').nth(1)).toContainText('Gold medal')
  })

  test('is offered right after ending, in case it was a slip', async ({ page }) => {
    await playOneGame(page, 'Slip')
    await endAndSave(page)
    await expect(page.getByText('Session saved to the all-time leaderboard')).toBeVisible()

    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByRole('heading', { name: 'Slip' })).toBeVisible()
    await page.getByRole('tab', { name: 'Standings' }).click()
    await expect(page.getByRole('row').nth(1)).toContainText('Ann')
  })

  test('keeps working after a reload', async ({ page }) => {
    await playOneGame(page, 'Reloaded')
    await endAndSave(page)
    const list = await openPast(page)
    await list.getByRole('button', { name: /Reloaded/ }).click()
    await page.getByRole('dialog', { name: 'Reloaded' }).getByRole('button', { name: 'Resume this session' }).click()
    await expect(page.getByRole('heading', { name: 'Reloaded' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Reloaded' })).toBeVisible()
    await page.getByRole('tab', { name: 'Standings' }).click()
    await expect(page.getByRole('row').nth(1)).toContainText('Ann')
  })

  test('updates the same entry when it ends again, instead of adding another', async ({ page }) => {
    await playOneGame(page, 'Twice')
    await endAndSave(page)
    let list = await openPast(page)
    await list.getByRole('button', { name: /Twice/ }).click()
    await page.getByRole('dialog', { name: 'Twice' }).getByRole('button', { name: 'Resume this session' }).click()

    await startGame(page)
    await recordWin(page)
    await expect(page.getByText('Court 1: Team A won').last()).toBeVisible()
    await endAndSave(page)

    list = await openPast(page)
    await expect(list.getByRole('listitem')).toHaveCount(1)
    await expect(list.getByRole('listitem')).toContainText('2 games')
  })

  test('never counts the same games twice in the all-time totals', async ({ page }) => {
    await playOneGame(page, 'Careful')
    await endAndSave(page)

    const list = await openPast(page)
    await list.getByRole('button', { name: /Careful/ }).click()
    await page.getByRole('dialog', { name: 'Careful' }).getByRole('button', { name: 'Resume this session' }).click()
    await startGame(page)
    await recordWin(page)
    await expect(page.getByText('Court 1: Team A won').last()).toBeVisible()
    await endAndSave(page)

    await page.getByRole('button', { name: 'Lifetime leaderboard' }).click()
    const board = page.getByRole('dialog')
    const ann = board.getByRole('row').filter({ hasText: 'Ann' })
    await expect(ann.getByRole('cell').nth(2)).toHaveText('2') // games: not 3
    await expect(ann).toContainText('100%')
    await expect(board.getByRole('row').filter({ hasText: 'Bob' }).getByRole('cell').nth(2)).toHaveText('2')
  })

  test('saving again without playing adds nothing', async ({ page }) => {
    await playOneGame(page, 'Idle')
    await endAndSave(page)
    const list = await openPast(page)
    await list.getByRole('button', { name: /Idle/ }).click()
    await page.getByRole('dialog', { name: 'Idle' }).getByRole('button', { name: 'Resume this session' }).click()
    await expect(page.getByRole('heading', { name: 'Idle' })).toBeVisible()
    await endAndSave(page)

    await page.getByRole('button', { name: 'Lifetime leaderboard' }).click()
    const ann = page.getByRole('dialog').getByRole('row').filter({ hasText: 'Ann' })
    await expect(ann.getByRole('cell').nth(2)).toHaveText('1')
  })
})
