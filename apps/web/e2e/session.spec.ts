import { expect, test, type Page } from '@playwright/test'
import { checkIn, startGame, startSession, recordWin } from './helpers'

const FIVE = ['Ann', 'Bob', 'Cy', 'Dee', 'Eve']

test('starts a session with the chosen courts and mode', async ({ page }) => {
  await startSession(page, { location: 'Downtown', courts: 3, mode: 'Singles' })
  await expect(page.getByText('Singles', { exact: true })).toBeVisible()
  await expect(page.getByText('3 courts')).toBeVisible()
  await expect(page.getByRole('region', { name: /Court \d/ })).toHaveCount(3)
  await expect(page.getByText('No one waiting')).toBeVisible()
})

test('does not start a game by itself, and shows who is next up', async ({ page }) => {
  await startSession(page)
  await checkIn(page, FIVE)

  const court = page.getByRole('region', { name: 'Court 1' })
  await expect(court.getByText('Open')).toBeVisible()
  await expect(court.getByText('In play')).toHaveCount(0)
  await expect(page.getByText('Queue (5)')).toBeVisible()

  // Next up is the first four, already split into teams; the fifth keeps waiting.
  const nextUp = page.getByRole('group', { name: 'Next up' })
  await expect(nextUp.getByText('Team A', { exact: true })).toBeVisible()
  await expect(nextUp.getByText('Team B', { exact: true })).toBeVisible()
  await expect(nextUp.getByText('Eve')).toHaveCount(0)
  for (const name of ['Ann', 'Bob', 'Cy', 'Dee']) await expect(nextUp.getByText(name)).toBeVisible()
  await expect(page.getByText('Next up', { exact: true })).toHaveCount(5) // card title + four queue badges
})

test('lists Next up right above the Queue, below the courts', async ({ page }) => {
  await startSession(page, { courts: 2 })
  await checkIn(page, FIVE)

  const top = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!.y
  const court2 = await top(page.getByRole('region', { name: 'Court 2' }))
  const nextUp = await top(page.getByRole('group', { name: 'Next up' }))
  const queue = await top(page.getByText(/^Queue \(/))
  expect(court2).toBeLessThan(nextUp)
  expect(nextUp).toBeLessThan(queue)

  // Nothing sits between the two cards: Next up ends where the Queue begins (one gap apart).
  const nextUpBox = (await page.getByRole('group', { name: 'Next up' }).boundingBox())!
  const queueCard = page.getByText(/^Queue \(/).locator('xpath=ancestor::*[@data-slot="card"][1]')
  const queueBox = (await queueCard.boundingBox())!
  expect(queueBox.y - (nextUpBox.y + nextUpBox.height)).toBeLessThan(40)
})

test('starts the next four on the court and queues the extra player', async ({ page }) => {
  await startSession(page)
  await checkIn(page, FIVE)
  await startGame(page)

  const court = page.getByRole('region', { name: 'Court 1' })
  await expect(page.getByText('Court 1 started')).toBeVisible()
  await expect(court.getByText('Team A', { exact: true })).toBeVisible()
  await expect(court.getByText('Team B', { exact: true })).toBeVisible()
  await expect(court.getByText('Eve')).toHaveCount(0)
  await expect(page.getByText('Queue (1)')).toBeVisible()
  // The only court is busy, so the waiting player sees a wait estimate (12 min average game, 1 court).
  await expect(page.getByText('~12 min')).toBeVisible()
  // Only Eve is left, so nobody is next up until someone else checks in.
  await expect(page.getByRole('group', { name: 'Next up' }).getByText('Waiting for 3 more players.')).toBeVisible()
})

test('records a result, leaves the court open and undoes it', async ({ page }) => {
  await startSession(page)
  await checkIn(page, FIVE)
  await startGame(page)
  const court = page.getByRole('region', { name: 'Court 1' })

  await recordWin(page)
  await expect(page.getByText('Court 1: Team A won')).toBeVisible()
  // Nothing starts by itself: the court is open, and everyone is queued with Eve first.
  await expect(court.getByText('Open')).toBeVisible()
  await expect(page.getByText('Queue (5)')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Next up' }).getByText('Eve')).toBeVisible()

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(court.getByText('In play')).toBeVisible()
  await expect(page.getByText('Queue (1)')).toBeVisible()
})

test('sends the next group to whichever court staff choose', async ({ page }) => {
  await startSession(page, { courts: 2 })
  await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee', 'Eve', 'Flo', 'Gus', 'Hal'])

  await startGame(page, 'Court 2')
  await expect(page.getByRole('region', { name: 'Court 1' }).getByText('Open')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Court 2' }).getByText('Ann')).toBeVisible()
  // Next up has moved on to the following four.
  const nextUp = page.getByRole('group', { name: 'Next up' })
  await expect(nextUp.getByText('Eve')).toBeVisible()
  await expect(nextUp.getByText('Ann')).toHaveCount(0)

  await startGame(page, 'Court 1')
  await expect(page.getByText('No one waiting')).toBeVisible()
})

test('skips a player on a break when choosing who is next up', async ({ page }) => {
  await startSession(page)
  await checkIn(page, FIVE)
  await page.getByRole('tab', { name: 'Check-in' }).click()
  await page.getByRole('listitem').filter({ hasText: 'Ann' }).getByRole('button', { name: 'Take a break' }).click()
  await page.getByRole('tab', { name: 'Board' }).click()

  const nextUp = page.getByRole('group', { name: 'Next up' })
  await expect(nextUp.getByText('Ann')).toHaveCount(0)
  await expect(nextUp.getByText('Eve')).toBeVisible()
})

test('refuses to undo once the session has changed', async ({ page }) => {
  await startSession(page)
  await checkIn(page, FIVE)
  await startGame(page)

  await recordWin(page, 'Court 1', 'B')
  await expect(page.getByText('Court 1: Team B won')).toBeVisible()
  await checkIn(page, ['Flo'])

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText("Can't undo: the session changed after that result")).toBeVisible()
  await expect(page.getByText('Queue (6)')).toBeVisible()
})

test('lets a waiting player take a break and come back', async ({ page }) => {
  await startSession(page)
  await checkIn(page, FIVE)
  await startGame(page)

  await page.getByRole('tab', { name: 'Check-in' }).click()
  await page.getByRole('button', { name: 'Take a break' }).click()
  await expect(page.getByText('On a break (1)')).toBeVisible()
  await expect(page.getByText('No one is waiting.')).toBeVisible()

  await page.getByRole('button', { name: 'Back to queue' }).click()
  await expect(page.getByText('On a break')).toHaveCount(0)
  await expect(page.getByText('Waiting (1) · Playing (4)')).toBeVisible()
})

test('saves the chosen skill level', async ({ page }) => {
  await startSession(page)
  await page.getByRole('tab', { name: 'Check-in' }).click()
  await page.getByLabel('Player name').fill('Zed')
  await page.getByLabel('Skill level').click()
  await page.getByRole('option', { name: '5 · Advanced' }).click()
  await page.getByRole('button', { name: 'Check in', exact: true }).click()

  await expect(page.getByText('Zed checked in')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Zed' }).getByText('Advanced')).toBeVisible()
})

test('replaces a playing player with someone waiting', async ({ page }) => {
  await startSession(page)
  await checkIn(page, FIVE)
  await startGame(page)
  const court = page.getByRole('region', { name: 'Court 1' })
  await expect(court.getByText('Ann')).toBeVisible()

  await court.getByRole('button', { name: 'Replace Ann' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Replace Ann')).toBeVisible()
  await dialog.getByRole('button', { name: /Eve/ }).click()

  await expect(page.getByText('Eve replaced Ann')).toBeVisible()
  await expect(court.getByText('Eve')).toBeVisible()
  await expect(court.getByText('Ann')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Check-in' }).click()
  await expect(page.getByText('On a break (1)')).toBeVisible()
})

test('offers no substitute when nobody is waiting', async ({ page }) => {
  await startSession(page)
  await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee'])
  await startGame(page)
  await page.getByRole('button', { name: 'Replace Ann' }).click()
  await expect(page.getByText('No one is waiting to substitute')).toBeVisible()
})

test('uses the game length from setup and lets it be changed', async ({ page }) => {
  await startSession(page, { gameMinutes: 20 })
  await checkIn(page, FIVE)
  await startGame(page)
  await expect(page.getByText('~20 min')).toBeVisible()

  await page.getByLabel('Game length (min)').fill('30')
  await expect(page.getByText('~30 min')).toBeVisible()
})

test('keeps the session after a reload', async ({ page }) => {
  await startSession(page, { location: 'Persistent Club' })
  await checkIn(page, FIVE)
  await startGame(page)

  await page.reload()

  await expect(page.getByRole('heading', { name: 'Persistent Club' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Court 1' }).getByText('In play')).toBeVisible()
  await expect(page.getByText('Queue (1)')).toBeVisible()
})

test('keeps working offline', async ({ page, context }) => {
  await startSession(page)
  await checkIn(page, FIVE)
  await startGame(page)

  await context.setOffline(true)
  await recordWin(page)
  await expect(page.getByText('Court 1: Team A won')).toBeVisible()
})

test('ends the session after confirming', async ({ page }) => {
  await startSession(page)
  await page.getByRole('button', { name: 'End session' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('End this session?')).toBeVisible()
  await dialog.getByRole('button', { name: 'End session' }).click()

  await expect(page.getByText('Set up an open play session')).toBeVisible()
})
