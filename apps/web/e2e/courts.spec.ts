import { expect, test, type Page } from '@playwright/test'
import { checkIn, startGame, startSession, recordWin } from './helpers'

const EIGHT = ['Ann', 'Bob', 'Cy', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal']

/**
 * The courts as they appear on the board, top to bottom. Court cards set role="region"
 * themselves; selecting on the attribute keeps out the toast area, which is also a region.
 */
const courtOrder = (page: Page) =>
  page.locator('[role="region"]').evaluateAll((elements) => elements.map((el) => el.getAttribute('aria-label')))

/** Open the Manage courts dialog. */
async function manage(page: Page) {
  await page.getByRole('button', { name: 'Manage courts' }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage courts' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function closeDialog(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test.describe('adding a court', () => {
  test('opens another court, and staff start it when ready', async ({ page }) => {
    await startSession(page)
    await checkIn(page, EIGHT)
    await startGame(page)
    await expect(page.getByText('1 court')).toBeVisible()
    await expect(page.getByText('Queue (4)')).toBeVisible()

    await page.getByRole('button', { name: 'Add court' }).click()

    await expect(page.getByText('Court 2 added')).toBeVisible()
    await expect(page.getByText('2 courts')).toBeVisible()
    // The new court is open: the waiting players do not move onto it by themselves.
    const court2 = page.getByRole('region', { name: 'Court 2' })
    await expect(court2.getByText('Open')).toBeVisible()
    await expect(page.getByText('Queue (4)')).toBeVisible()

    await startGame(page, 'Court 2')
    for (const name of ['Eve', 'Fay', 'Gus', 'Hal']) await expect(court2.getByText(name)).toBeVisible()
    await expect(page.getByText('No one waiting')).toBeVisible()
  })

  test('leaves the new court open when nobody is waiting', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee'])
    await startGame(page)
    await page.getByRole('button', { name: 'Add court' }).click()
    const court2 = page.getByRole('region', { name: 'Court 2' })
    await expect(court2.getByText('Open')).toBeVisible()
    await expect(court2.getByRole('button', { name: 'Start game' })).toHaveCount(0)
  })

  test('stops at 15 courts', async ({ page }) => {
    await startSession(page, { courts: 15 })
    await expect(page.getByRole('button', { name: 'Add court' })).toBeDisabled()
    await expect(page.getByText('Maximum of 15 courts')).toBeVisible()

    const dialog = await manage(page)
    await expect(dialog.getByRole('button', { name: 'Add court' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Close Court 15' }).click()
    await expect(dialog.getByRole('button', { name: 'Add court' })).toBeEnabled()
  })

  test('adds from inside the manage dialog too', async ({ page }) => {
    await startSession(page)
    const dialog = await manage(page)
    await dialog.getByRole('button', { name: 'Add court' }).click()
    await expect(dialog.getByLabel('Name of Court 2')).toBeVisible()
  })

  test('reuses the lowest free number', async ({ page }) => {
    await startSession(page, { courts: 3 })
    const dialog = await manage(page)
    await dialog.getByRole('button', { name: 'Close Court 2' }).click()
    await closeDialog(page)
    expect(await courtOrder(page)).toEqual(['Court 1', 'Court 3'])

    await page.getByRole('button', { name: 'Add court' }).click()
    await expect(page.getByText('Court 2 added')).toBeVisible()
    expect(await courtOrder(page)).toEqual(['Court 1', 'Court 3', 'Court 2'])
  })
})

test.describe('renaming a court', () => {
  test('changes the name everywhere', async ({ page }) => {
    await startSession(page, { courts: 2 })
    await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee'])
    await startGame(page)
    const dialog = await manage(page)
    const field = dialog.getByLabel('Name of Court 1')
    await field.fill('  Center Court ')
    await field.press('Enter')
    await expect(dialog.getByLabel('Name of Center Court')).toHaveValue('Center Court')
    await closeDialog(page)

    expect(await courtOrder(page)).toEqual(['Center Court', 'Court 2'])
    // The game in progress is untouched, and results use the new name.
    const court = page.getByRole('region', { name: 'Center Court' })
    await expect(court.getByText('Ann')).toBeVisible()
    await recordWin(page, 'Center Court')
    await expect(page.getByText('Center Court: Team A won')).toBeVisible()
  })

  test('explains why an empty or duplicate name is refused, and changes nothing', async ({ page }) => {
    await startSession(page, { courts: 2 })
    const dialog = await manage(page)
    const field = dialog.getByLabel('Name of Court 1')

    await field.fill('court 2')
    await field.press('Enter')
    await expect(dialog.getByRole('alert')).toHaveText('Another court already has that name')

    await field.fill('   ')
    await field.press('Enter')
    await expect(dialog.getByRole('alert')).toHaveText('Give the court a name')

    await field.fill('Fixed')
    await field.press('Enter')
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await closeDialog(page)
    expect(await courtOrder(page)).toEqual(['Fixed', 'Court 2'])
  })

  test('limits names to 40 characters', async ({ page }) => {
    await startSession(page)
    const dialog = await manage(page)
    const field = dialog.getByLabel('Name of Court 1')
    await field.fill('x'.repeat(60))
    await expect(field).toHaveValue('x'.repeat(40))
  })
})

test.describe('reordering courts', () => {
  test('moves a court up and down, and the board follows', async ({ page }) => {
    await startSession(page, { courts: 3 })
    const dialog = await manage(page)
    await expect(dialog.getByRole('button', { name: 'Move Court 1 up' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Move Court 3 down' })).toBeDisabled()

    await dialog.getByRole('button', { name: 'Move Court 1 down' }).click()
    await closeDialog(page)
    expect(await courtOrder(page)).toEqual(['Court 2', 'Court 1', 'Court 3'])

    const again = await manage(page)
    await again.getByRole('button', { name: 'Move Court 3 up' }).click()
    await closeDialog(page)
    expect(await courtOrder(page)).toEqual(['Court 2', 'Court 3', 'Court 1'])
  })

  test('keeps a game on its court when the order changes', async ({ page }) => {
    await startSession(page, { courts: 2 })
    await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee'])
    await startGame(page, 'Court 2')
    const dialog = await manage(page)
    await dialog.getByRole('button', { name: 'Move Court 2 up' }).click()
    await closeDialog(page)

    expect(await courtOrder(page)).toEqual(['Court 2', 'Court 1'])
    await expect(page.getByRole('region', { name: 'Court 2' }).getByText('In play')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Court 1' }).getByText('Open')).toBeVisible()
  })
})

test.describe('closing a court', () => {
  test('closes an empty court straight away', async ({ page }) => {
    await startSession(page, { courts: 2 })
    const dialog = await manage(page)
    await dialog.getByRole('button', { name: 'Close Court 2' }).click()
    await expect(page.getByText('Court 2 closed')).toBeVisible()
    await closeDialog(page)
    await expect(page.getByText('1 court')).toBeVisible()
    expect(await courtOrder(page)).toEqual(['Court 1'])
  })

  test('never closes the last court', async ({ page }) => {
    await startSession(page)
    const dialog = await manage(page)
    await expect(dialog.getByRole('button', { name: 'Close Court 1' })).toBeDisabled()
  })

  test('asks before cancelling a game, and only cancels when confirmed', async ({ page }) => {
    await startSession(page, { courts: 2 })
    await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee'])
    await startGame(page) // Court 1 plays, Court 2 is open
    const dialog = await manage(page)

    await dialog.getByRole('button', { name: 'Close Court 1' }).click()
    const confirm = dialog.getByRole('group', { name: 'Confirm closing Court 1' })
    await expect(confirm).toContainText('Cancel the game and close Court 1?')

    // Changing my mind leaves everything as it was.
    await confirm.getByRole('button', { name: 'Keep court' }).click()
    await expect(confirm).toHaveCount(0)
    await closeDialog(page)
    await expect(page.getByRole('region', { name: 'Court 1' }).getByText('In play')).toBeVisible()

    // Confirming closes it, and the four players go back to the queue.
    const again = await manage(page)
    await again.getByRole('button', { name: 'Close Court 1' }).click()
    await again.getByRole('button', { name: 'Cancel game and close' }).click()
    await expect(page.getByText('Court 1 closed')).toBeVisible()
    await closeDialog(page)

    expect(await courtOrder(page)).toEqual(['Court 2'])
    await expect(page.getByRole('region', { name: 'Court 2' }).getByText('Open')).toBeVisible()
    await expect(page.getByText('1 court')).toBeVisible()
    await expect(page.getByText('Queue (4)')).toBeVisible()
    const nextUp = page.getByRole('group', { name: 'Next up' })
    for (const name of ['Ann', 'Bob', 'Cy', 'Dee']) await expect(nextUp.getByText(name)).toBeVisible()
  })

  test('puts a cancelled game’s players first in the queue when no court is free', async ({ page }) => {
    await startSession(page, { courts: 2 })
    await checkIn(page, [...EIGHT, 'Ivy'])
    await startGame(page, 'Court 1')
    await startGame(page, 'Court 2') // both courts busy, Ivy waits
    const dialog = await manage(page)
    await dialog.getByRole('button', { name: 'Close Court 1' }).click()
    await dialog.getByRole('button', { name: 'Cancel game and close' }).click()
    await closeDialog(page)

    await expect(page.getByText('Queue (5)')).toBeVisible()
    const first = page.getByRole('listitem').filter({ hasText: /^1/ }).first()
    await expect(first).toContainText(/Ann|Bob|Cy|Dee/)
    await expect(page.getByRole('listitem').filter({ hasText: /^5.*Ivy/ })).toBeVisible()
  })
})

test('keeps names and order after a reload', async ({ page }) => {
  await startSession(page, { courts: 3 })
  const dialog = await manage(page)
  const field = dialog.getByLabel('Name of Court 3')
  await field.fill('Center Court')
  await field.press('Enter')
  await dialog.getByRole('button', { name: 'Move Center Court up' }).click()
  await dialog.getByRole('button', { name: 'Move Center Court up' }).click()
  await closeDialog(page)
  expect(await courtOrder(page)).toEqual(['Center Court', 'Court 1', 'Court 2'])

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Test Club' })).toBeVisible()
  expect(await courtOrder(page)).toEqual(['Center Court', 'Court 1', 'Court 2'])
})
