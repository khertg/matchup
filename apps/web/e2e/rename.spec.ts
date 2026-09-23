import { expect, test, type Page } from '@playwright/test'
import { queueRow, viewAvatar } from './avatarHelpers'
import { checkIn, openSessionMenu, recordWin, startGame, startSession } from './helpers'

async function endSession(page: Page) {
  await openSessionMenu(page)
  await page.getByRole('button', { name: 'End session' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^(Save and end session|End session)$/ }).click()
  await expect(page.getByText('Set up an open play session')).toBeVisible()
}

/** Open a player's large avatar view and go on to editing the name. */
async function editName(page: Page, name: string, scope: Page | ReturnType<Page['locator']> = page) {
  const view = await viewAvatar(page, name, scope)
  await view.getByRole('button', { name: 'Edit name' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit name' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function saveName(page: Page, dialog: ReturnType<Page['locator']>, next: string) {
  await dialog.getByLabel('Player name').fill(next)
  await dialog.getByRole('button', { name: 'Save name' }).click()
}

test.describe('editing a player name', () => {
  test('changes the name everywhere the player appears', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee', 'Eve'])
    await startGame(page)
    const court = page.getByRole('region', { name: 'Court 1', exact: true })
    // Ann is on the court in the first game (first in the queue).
    await expect(court.getByText('Ann')).toBeVisible()

    const dialog = await editName(page, 'Ann', court)
    await saveName(page, dialog, '  Anne ')
    await expect(page.getByText('Ann is now Anne')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await expect(court.getByText('Anne')).toBeVisible()
    await expect(court.getByText('Ann', { exact: true })).toHaveCount(0)

    // Standings and the check-in tab follow.
    await recordWin(page)
    await page.getByRole('tab', { name: 'Standings' }).click()
    await expect(page.getByRole('table').first().getByRole('row').filter({ hasText: 'Anne' })).toHaveCount(1)
    await expect(page.getByRole('table').first().getByText('Ann', { exact: true })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Check-in' }).click()
    await expect(page.getByText('Anne').first()).toBeVisible()
    await expect(page.getByText('Ann', { exact: true })).toHaveCount(0)
  })

  test('a queued player and the Next up card show the new name', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee', 'Eve'])
    const dialog = await editName(page, 'Eve', queueRow(page, 'Eve'))
    await saveName(page, dialog, 'Evelyn')
    await expect(queueRow(page, 'Evelyn')).toBeVisible()
    await expect(queueRow(page, 'Eve').filter({ hasNotText: 'Evelyn' })).toHaveCount(0)
  })

  test('refuses a name that another player has, and changes nothing', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    const dialog = await editName(page, 'Bob', queueRow(page, 'Bob'))
    await saveName(page, dialog, ' ann ')
    await expect(dialog.getByRole('alert')).toContainText('already')
    await expect(dialog).toBeVisible() // still open, so the name can be fixed
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await page.keyboard.press('Escape')
    await expect(queueRow(page, 'Bob')).toBeVisible()
    await expect(queueRow(page, 'Ann')).toBeVisible()
  })

  test('refuses an empty name', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    const dialog = await editName(page, 'Ann', queueRow(page, 'Ann'))
    await dialog.getByLabel('Player name').fill('   ')
    await expect(dialog.getByRole('button', { name: 'Save name' })).toBeDisabled()
  })

  test('allows changing only the capitals of a name', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['ann', 'Bob'])
    const dialog = await editName(page, 'ann', queueRow(page, 'ann'))
    await saveName(page, dialog, 'Ann')
    await expect(queueRow(page, 'Ann')).toBeVisible()
  })

  test('Escape cancels the edit first, and the name stays as it was', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    const dialog = await editName(page, 'Ann', queueRow(page, 'Ann'))
    await dialog.getByLabel('Player name').fill('Somebody else')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Ann', exact: true })).toBeVisible() // back on the picture
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(queueRow(page, 'Ann')).toBeVisible()
    await expect(queueRow(page, 'Somebody else')).toHaveCount(0)
  })

  test('the new name is what the saved player is called at the next check-in', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    const dialog = await editName(page, 'Ann', queueRow(page, 'Ann'))
    await saveName(page, dialog, 'Anne')
    await expect(queueRow(page, 'Anne')).toBeVisible()
    await endSession(page)

    await startSession(page)
    await page.getByRole('tab', { name: 'Check-in' }).click()
    const roster = page.getByRole('group', { name: 'Check in from the roster' })
    await expect(roster.getByRole('checkbox', { name: 'Anne' })).toBeVisible()
    await expect(roster.getByRole('checkbox', { name: 'Ann', exact: true })).toHaveCount(0)
  })

  test('a saved player who is not checked in can be renamed from the roster list', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Zed'])
    await endSession(page)
    await startSession(page)
    await page.getByRole('tab', { name: 'Check-in' }).click()
    const roster = page.getByRole('group', { name: 'Check in from the roster' })
    const dialog = await editName(page, 'Zed', roster)
    await saveName(page, dialog, 'Zeke')
    await expect(roster.getByRole('checkbox', { name: 'Zeke' })).toBeVisible()
    await expect(roster.getByRole('checkbox', { name: 'Zeke' })).not.toBeChecked()
  })

  test('sessions that already ended keep the name they had that day', async ({ page }) => {
    await startSession(page, { location: 'First Night', mode: 'Singles' })
    await checkIn(page, ['Ann', 'Bob'])
    await startGame(page)
    await recordWin(page)
    await endSession(page)

    await startSession(page, { location: 'Second Night', mode: 'Singles' })
    await checkIn(page, ['Ann', 'Bob'])
    const dialog = await editName(page, 'Ann', queueRow(page, 'Ann'))
    await saveName(page, dialog, 'Anne')
    await expect(queueRow(page, 'Anne')).toBeVisible()
    await endSession(page)

    await page.getByRole('button', { name: 'Past sessions' }).click()
    await page.getByRole('dialog', { name: 'Past sessions' }).getByRole('button', { name: /First Night/ }).click()
    const view = page.getByRole('dialog', { name: 'First Night' })
    await expect(view.getByRole('table').first().getByText('Ann', { exact: true })).toBeVisible()
    await expect(view.getByText('Anne')).toHaveCount(0)
  })

  test('the live page and past sessions cannot edit names', async ({ page }) => {
    await startSession(page, { mode: 'Singles' })
    await checkIn(page, ['Ann', 'Bob'])
    await startGame(page)
    await recordWin(page)
    await endSession(page)
    await page.getByRole('button', { name: 'Past sessions' }).click()
    await page.getByRole('dialog', { name: 'Past sessions' }).getByRole('button', { name: /Test Club/ }).click()
    const view = page.getByRole('dialog', { name: 'Test Club' })
    await view.getByRole('button', { name: "View Ann's avatar" }).first().click()
    const large = page.getByRole('dialog', { name: 'Ann', exact: true })
    await expect(large).toBeVisible()
    await expect(large.getByRole('button', { name: 'Edit name' })).toHaveCount(0)
    await expect(large.getByRole('button', { name: 'Change avatar' })).toHaveCount(0)
  })
})
