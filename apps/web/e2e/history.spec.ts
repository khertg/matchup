import { expect, test, type Page } from '@playwright/test'
import { queueRow } from './avatarHelpers'
import { checkIn, openSessionMenu, startGame, startSession, recordWin } from './helpers'

/** Singles on one court: Ann is Blue, so "Blue won" gives Ann the win. */
async function playOneGame(page: Page, location = 'Sunset Club') {
  await startSession(page, { location, mode: 'Singles' })
  await checkIn(page, ['Ann', 'Bob'])
  await startGame(page)
  await recordWin(page)
  await expect(page.getByText('Court 1: Blue won')).toBeVisible()
}

async function endAndSave(page: Page) {
  await openSessionMenu(page)
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
    // Too few to need pages.
    await expect(list.getByRole('navigation', { name: 'Past sessions pages' })).toHaveCount(0)
  })

  test('shows a long history ten sessions at a time', async ({ page }) => {
    await playOneGame(page, 'Night 1')
    await endAndSave(page)
    // Copy that session ten more times straight into the device's history, each ending an hour later.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('q2dink')
          open.onerror = () => reject(open.error)
          open.onsuccess = () => {
            const tx = open.result.transaction('history', 'readwrite')
            const store = tx.objectStore('history')
            const all = store.getAll()
            all.onsuccess = () => {
              const first = all.result[0]
              for (let n = 2; n <= 11; n++) {
                store.put({ ...first, id: crypto.randomUUID(), location: `Night ${n}`, endedAt: first.endedAt + n * 3_600_000 })
              }
            }
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
          }
        }),
    )
    // Also clears the "ended" toast, which on a phone covers the Past sessions button.
    await page.reload()

    const list = await openPast(page)
    const rows = list.getByRole('listitem')
    const pages = list.getByRole('navigation', { name: 'Past sessions pages' })
    await expect(rows).toHaveCount(10)
    await expect(rows.nth(0)).toContainText('Night 11')
    await expect(pages).toContainText('Page 1 of 2')
    await expect(pages.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await pages.getByRole('button', { name: 'Next' }).click()
    await expect(rows).toHaveCount(1)
    await expect(rows.nth(0)).toContainText('Night 1')
    await expect(pages).toContainText('Page 2 of 2')
    await expect(pages.getByRole('button', { name: 'Next' })).toBeDisabled()

    // Back from a session returns to the same page.
    await rows.nth(0).getByRole('button').click()
    await page.getByRole('dialog', { name: 'Night 1' }).getByRole('button', { name: 'Back' }).click()
    await expect(pages).toContainText('Page 2 of 2')

    // Opening the list again starts from the newest.
    await page.keyboard.press('Escape')
    const again = await openPast(page)
    await expect(again.getByRole('navigation', { name: 'Past sessions pages' })).toContainText('Page 1 of 2')
  })

  test('says so when there is nothing yet, and never saves a session nobody joined', async ({ page }) => {
    await startSession(page, { location: 'Empty Night' })
    await openSessionMenu(page)
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

  test('a deleted session can be brought back with Undo, or from Recently deleted', async ({ page }) => {
    await playOneGame(page)
    await endAndSave(page)
    const deleteIt = async () => {
      await (await openPast(page)).getByRole('button', { name: /Sunset Club/ }).click()
      const view = page.getByRole('dialog', { name: 'Sunset Club' })
      await view.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(view.getByText('It can be restored for 30 days.')).toBeVisible()
      await view.getByRole('button', { name: 'Delete session' }).click()
    }

    // Undo, straight away from the list.
    await deleteIt()
    const list = page.getByRole('dialog', { name: 'Past sessions' })
    await expect(list.getByText('No past sessions yet.')).toBeVisible()
    const undo = list.getByRole('status').filter({ hasText: '“Sunset Club” moved to Recently deleted.' })
    await undo.getByRole('button', { name: 'Undo' }).click()
    await expect(undo).toHaveCount(0)
    await expect(list.getByRole('button', { name: /Sunset Club/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.reload() // clears the toasts

    // Later, from Recently deleted: it shows when it was deleted and how long it stays.
    await deleteIt()
    await list.getByRole('button', { name: 'Recently deleted (1)' }).click()
    const trash = page.getByRole('dialog', { name: 'Recently deleted' })
    const item = trash.getByRole('list', { name: 'Recently deleted' }).getByRole('listitem')
    await expect(item).toContainText('Sunset Club')
    await expect(item).toContainText('removed for good in 30 days')
    // It can be opened to look at, but not resumed.
    await item.getByRole('button', { name: /Sunset Club/ }).click()
    const view = page.getByRole('dialog', { name: 'Sunset Club' })
    await expect(view.getByRole('row').nth(1)).toContainText('Ann')
    await expect(view.getByRole('button', { name: 'Resume this session' })).toHaveCount(0)
    await view.getByRole('button', { name: 'Restore' }).click()
    await expect(page.getByText('“Sunset Club” restored')).toBeVisible()
    await expect(list.getByRole('button', { name: /Sunset Club/ })).toBeVisible()
    await expect(list.getByRole('button', { name: /Recently deleted/ })).toHaveCount(0)
  })

  test('deletes a session for good from Recently deleted, only after asking', async ({ page }) => {
    await playOneGame(page)
    await endAndSave(page)
    await (await openPast(page)).getByRole('button', { name: /Sunset Club/ }).click()
    const view = page.getByRole('dialog', { name: 'Sunset Club' })
    await view.getByRole('button', { name: 'Delete', exact: true }).click()
    await view.getByRole('button', { name: 'Delete session' }).click()
    const list = page.getByRole('dialog', { name: 'Past sessions' })
    await list.getByRole('button', { name: 'Recently deleted (1)' }).click()

    const trash = page.getByRole('dialog', { name: 'Recently deleted' })
    await trash.getByRole('button', { name: 'Delete for good' }).click()
    const confirm = trash.getByRole('group', { name: 'Confirm deleting Sunset Club for good' })
    await confirm.getByRole('button', { name: 'Keep it' }).click()
    await expect(confirm).toHaveCount(0)
    await trash.getByRole('button', { name: 'Delete for good' }).click()
    await confirm.getByRole('button', { name: 'Delete for good' }).click()
    await expect(page.getByText('“Sunset Club” deleted for good')).toBeVisible()
    await expect(list.getByText('No past sessions yet.')).toBeVisible()
    await expect(list.getByRole('button', { name: /Recently deleted/ })).toHaveCount(0)
    await page.reload()
    await expect((await openPast(page)).getByText('No past sessions yet.')).toBeVisible()
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
    await expect(page.getByText('Court 1: Blue won')).toBeVisible()
    await startGame(page, 'Court 2') // Cy v Dee is on court when it ends
    await openSessionMenu(page)
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

  test('freezes the wait and elapsed game time across the gap, instead of counting it', async ({ page }) => {
    await page.clock.install()
    await startSession(page, { location: 'Frozen', mode: 'Singles', courts: 1 })
    await checkIn(page, ['Ann', 'Bob', 'Cy']) // Ann and Bob start; Cy waits
    await startGame(page)
    await page.clock.fastForward('05:00') // Cy has waited 5 min; the game has run 5 min

    await openSessionMenu(page)
    await page.getByRole('button', { name: 'End session' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'End session' }).click()
    await expect(page.getByText('Set up an open play session')).toBeVisible()

    await page.clock.fastForward('24:00:00') // a whole day passes while the session is ended

    const list = await openPast(page)
    await list.getByRole('button', { name: /Frozen/ }).click()
    await page.getByRole('dialog', { name: 'Frozen' }).getByRole('button', { name: 'Resume this session' }).click()
    await expect(page.getByRole('heading', { name: 'Frozen' })).toBeVisible()

    // Still 5 minutes, not the day that passed while it sat ended.
    await expect(queueRow(page, 'Cy')).toContainText(/5m(\d+s)?/)
    await expect(page.getByRole('region', { name: 'Court 1' }).getByText(/^In play 5m(\d+s)?$/)).toBeVisible()
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
    await expect(page.getByText('Court 1: Blue won').last()).toBeVisible()
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
    await expect(page.getByText('Court 1: Blue won').last()).toBeVisible()
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
