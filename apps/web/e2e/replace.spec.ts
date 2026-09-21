import { expect, test, type Page } from '@playwright/test'
import { checkIn, choose, startGame, startSession } from './helpers'

const SIX = ['Ann', 'Bob', 'Cy', 'Dee', 'Eve', 'Fay']
const EIGHT = [...SIX, 'Gus', 'Hal']

const court = (page: Page, name = 'Court 1') => page.getByRole('region', { name, exact: true })
const nextUp = (page: Page) => page.getByRole('group', { name: 'Next up' })

/** Names in queue order, read from the Board's queue card. */
async function queueNames(page: Page) {
  const rows = await page.locator('ol > li').filter({ hasText: /Lv \d/ }).allInnerTexts()
  return rows.map((row) => row.replace(/^\d+\s+/, '').split(/\s/)[0])
}

test.describe('swapping a player on a court', () => {
  async function playing(page: Page) {
    await startSession(page)
    await checkIn(page, SIX)
    await startGame(page)
  }

  test('puts the player who came off at the front of the queue, not on a break', async ({ page }) => {
    await playing(page)
    await court(page).getByRole('button', { name: 'Replace Ann' }).click()
    const dialog = page.getByRole('dialog', { name: 'Replace Ann' })
    await expect(dialog).toContainText('Ann goes to the front of the queue')
    await dialog.getByRole('button', { name: /Fay/ }).click() // not the front of the queue: Eve is

    await expect(page.getByText('Fay replaced Ann. Ann is first in the queue.')).toBeVisible()
    await expect(court(page).getByText('Fay')).toBeVisible()
    await expect(court(page).getByText('Ann')).toHaveCount(0)
    expect(await queueNames(page)).toEqual(['Ann', 'Eve'])

    await page.getByRole('tab', { name: 'Check-in' }).click()
    await expect(page.getByText('On a break')).toHaveCount(0)
  })

  test('sends them on a break instead when that is ticked', async ({ page }) => {
    await playing(page)
    await court(page).getByRole('button', { name: 'Replace Ann' }).click()
    const dialog = page.getByRole('dialog', { name: 'Replace Ann' })
    await dialog.getByLabel('Send Ann on a break instead').check()
    await expect(dialog).toContainText('Ann will go on a break')
    await dialog.getByRole('button', { name: /Eve/ }).click()

    await expect(page.getByText('Eve replaced Ann. Ann is on a break.')).toBeVisible()
    expect(await queueNames(page)).toEqual(['Fay'])
    await page.getByRole('tab', { name: 'Check-in' }).click()
    await expect(page.getByText('On a break (1)')).toBeVisible()
  })

  test('starts unticked every time the pop-up opens', async ({ page }) => {
    await playing(page)
    await court(page).getByRole('button', { name: 'Replace Ann' }).click()
    const dialog = page.getByRole('dialog', { name: 'Replace Ann' })
    await dialog.getByLabel('Send Ann on a break instead').check()
    await page.keyboard.press('Escape')
    await court(page).getByRole('button', { name: 'Replace Bob' }).click()
    await expect(page.getByRole('dialog', { name: 'Replace Bob' }).getByLabel('Send Bob on a break instead')).not.toBeChecked()
  })

  test('the player who came off can be swapped straight back in', async ({ page }) => {
    await playing(page)
    await court(page).getByRole('button', { name: 'Replace Ann' }).click()
    await page.getByRole('dialog', { name: 'Replace Ann' }).getByRole('button', { name: /Eve/ }).click()
    await court(page).getByRole('button', { name: 'Replace Eve' }).click()
    await page.getByRole('dialog', { name: 'Replace Eve' }).getByRole('button', { name: /Ann/ }).click()
    await expect(court(page).getByText('Ann')).toBeVisible()
    await expect(court(page).getByText('Eve')).toHaveCount(0)
  })

  test('removes a partner lock and says so', async ({ page }) => {
    await startSession(page)
    await checkIn(page, SIX)
    await page.getByRole('tab', { name: 'Check-in' }).click()
    await choose(page, 'First partner', 'Ann')
    await choose(page, 'Second partner', 'Bob')
    await page.getByRole('button', { name: 'Lock partners' }).click()
    await page.getByRole('tab', { name: 'Board' }).click()
    await startGame(page)

    await court(page).getByRole('button', { name: 'Replace Ann' }).click()
    await page.getByRole('dialog', { name: 'Replace Ann' }).getByRole('button', { name: /Eve/ }).click()
    await expect(page.getByText('Their partner lock was removed.')).toBeVisible()
  })
})

test.describe('changing who is next up', () => {
  async function withEight(page: Page) {
    await startSession(page, { courts: 2 })
    await checkIn(page, EIGHT)
  }

  test('puts the chosen player in the group, and the replaced player keeps their place in the queue', async ({ page }) => {
    await withEight(page)
    await nextUp(page).getByRole('button', { name: 'Change Bob in Next up' }).click()
    const dialog = page.getByRole('dialog', { name: 'Replace Bob in Next up' })
    await expect(dialog).toContainText('Bob stays in the queue where they are')
    await expect(dialog.getByRole('button', { name: /Ann|Cy|Dee/ })).toHaveCount(0) // only players outside the group
    await dialog.getByRole('button', { name: /Gus/ }).click()

    await expect(page.getByText('Gus is next up instead of Bob.')).toBeVisible()
    for (const name of ['Ann', 'Cy', 'Dee', 'Gus']) await expect(nextUp(page).getByText(name)).toBeVisible()
    await expect(nextUp(page).getByText('Bob')).toHaveCount(0)
    // The queue itself is untouched, and the badges follow the group.
    expect(await queueNames(page)).toEqual(EIGHT)
    await expect(page.getByText('Next up', { exact: true })).toHaveCount(5) // card title + four badges
    await expect(page.getByRole('listitem').filter({ hasText: /^2\s*Bob/ }).getByText('Next up')).toHaveCount(0)
    await expect(page.getByRole('listitem').filter({ hasText: /^7\s*Gus/ }).getByText('Next up')).toBeVisible()
  })

  test('Start game puts exactly the chosen group on the court, and the next group is automatic again', async ({ page }) => {
    await withEight(page)
    await nextUp(page).getByRole('button', { name: 'Change Ann in Next up' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Hal/ }).click()

    await startGame(page, 'Court 2')
    for (const name of ['Bob', 'Cy', 'Dee', 'Hal']) await expect(court(page, 'Court 2').getByText(name)).toBeVisible()
    await expect(court(page, 'Court 1').getByText('Open')).toBeVisible()
    // Automatic again: Ann is first in line and the group is the next four in the queue.
    for (const name of ['Ann', 'Eve', 'Fay', 'Gus']) await expect(nextUp(page).getByText(name)).toBeVisible()
    await expect(nextUp(page).getByRole('button', { name: 'Reset' })).toHaveCount(0)
  })

  test('says the group was chosen, and Reset goes back to the automatic one', async ({ page }) => {
    await withEight(page)
    await expect(nextUp(page).getByRole('button', { name: 'Reset' })).toHaveCount(0)
    await nextUp(page).getByRole('button', { name: 'Change Ann in Next up' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Eve/ }).click()
    await expect(nextUp(page)).toContainText('Chosen by staff')

    await nextUp(page).getByRole('button', { name: 'Reset' }).click()
    for (const name of ['Ann', 'Bob', 'Cy', 'Dee']) await expect(nextUp(page).getByText(name)).toBeVisible()
    await expect(nextUp(page)).not.toContainText('Chosen by staff')
  })

  test('can be changed more than once', async ({ page }) => {
    await withEight(page)
    await nextUp(page).getByRole('button', { name: 'Change Ann in Next up' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Eve/ }).click()
    await nextUp(page).getByRole('button', { name: 'Change Eve in Next up' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Ann/ }).click()
    for (const name of ['Ann', 'Bob', 'Cy', 'Dee']) await expect(nextUp(page).getByText(name)).toBeVisible()
  })

  test('goes back to automatic if someone in the chosen group goes on a break', async ({ page }) => {
    await withEight(page)
    await nextUp(page).getByRole('button', { name: 'Change Ann in Next up' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Eve/ }).click()
    await expect(nextUp(page).getByText('Eve')).toBeVisible()

    await page.getByRole('tab', { name: 'Check-in' }).click()
    await page.getByRole('listitem').filter({ hasText: 'Eve' }).getByRole('button', { name: 'Take a break' }).click()
    await page.getByRole('tab', { name: 'Board' }).click()
    for (const name of ['Ann', 'Bob', 'Cy', 'Dee']) await expect(nextUp(page).getByText(name)).toBeVisible()
    await expect(nextUp(page)).not.toContainText('Chosen by staff')
  })

  test('offers nobody when everyone waiting is already in the group', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee'])
    await nextUp(page).getByRole('button', { name: 'Change Ann in Next up' }).click()
    await expect(page.getByRole('dialog')).toContainText('No one else is waiting to take their place.')
  })

  test('works in singles', async ({ page }) => {
    await startSession(page, { mode: 'Singles' })
    await checkIn(page, ['Ann', 'Bob', 'Cy'])
    await nextUp(page).getByRole('button', { name: 'Change Bob in Next up' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Cy/ }).click()
    await expect(nextUp(page).getByText('Cy')).toBeVisible()
    await expect(nextUp(page).getByText('Bob')).toHaveCount(0)
    await startGame(page)
    await expect(court(page).getByText('Cy')).toBeVisible()
  })

  test('unlocks partners it has to split, and says so', async ({ page }) => {
    await withEight(page)
    await page.getByRole('tab', { name: 'Check-in' }).click()
    await choose(page, 'First partner', 'Ann')
    await choose(page, 'Second partner', 'Bob')
    await page.getByRole('button', { name: 'Lock partners' }).click()
    await page.getByRole('tab', { name: 'Board' }).click()

    await nextUp(page).getByRole('button', { name: 'Change Ann in Next up' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /Eve/ }).click()
    await expect(page.getByText('Partner locks were removed.')).toBeVisible()
  })
})
