import { expect, test } from '@playwright/test'
import { checkIn, startSession } from './helpers'

const FIVE = ['Ann', 'Bob', 'Cy', 'Dee', 'Eve']

test('starts a session with the chosen courts and mode', async ({ page }) => {
  await startSession(page, { location: 'Downtown', courts: 3, mode: 'Singles' })
  await expect(page.getByText('Singles', { exact: true })).toBeVisible()
  await expect(page.getByText('3 courts')).toBeVisible()
  await expect(page.getByRole('region', { name: /Court \d/ })).toHaveCount(3)
  await expect(page.getByText('No one waiting')).toBeVisible()
})

test('stages a match automatically and queues the extra player', async ({ page }) => {
  await startSession(page)
  await checkIn(page, FIVE)

  const court = page.getByRole('region', { name: 'Court 1' })
  await expect(court.getByText('In play')).toBeVisible()
  await expect(court.getByText('Team A', { exact: true })).toBeVisible()
  await expect(court.getByText('Team B', { exact: true })).toBeVisible()
  await expect(court.getByText('Eve')).toHaveCount(0)
  await expect(page.getByText('Queue (1)')).toBeVisible()
  // The only court is busy, so the waiting player sees a wait estimate (12 min average game, 1 court).
  await expect(page.getByText('~12 min')).toBeVisible()
})

test('records a result, rotates the queue and undoes it', async ({ page }) => {
  await startSession(page)
  await checkIn(page, FIVE)
  const court = page.getByRole('region', { name: 'Court 1' })

  await court.getByRole('button', { name: 'Team A won' }).click()
  await expect(page.getByText('Court 1: Team A won')).toBeVisible()
  // The waiting player is now on court and one of the previous players waits.
  await expect(court.getByText('Eve')).toBeVisible()
  await expect(page.getByText('Queue (1)')).toBeVisible()

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(court.getByText('Eve')).toHaveCount(0)
  await expect(page.getByText('Queue (1)')).toBeVisible()
})

test('refuses to undo once the session has changed', async ({ page }) => {
  await startSession(page)
  await checkIn(page, FIVE)
  const court = page.getByRole('region', { name: 'Court 1' })

  await court.getByRole('button', { name: 'Team B won' }).click()
  await expect(page.getByText('Court 1: Team B won')).toBeVisible()
  await checkIn(page, ['Flo'])

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText("Can't undo: the session changed after that result")).toBeVisible()
  await expect(page.getByText('Queue (2)')).toBeVisible()
})

test('lets a waiting player take a break and come back', async ({ page }) => {
  await startSession(page)
  await checkIn(page, FIVE)

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
  await page.getByRole('button', { name: 'Replace Ann' }).click()
  await expect(page.getByText('No one is waiting to substitute')).toBeVisible()
})

test('uses the game length from setup and lets it be changed', async ({ page }) => {
  await startSession(page, { gameMinutes: 20 })
  await checkIn(page, FIVE)
  await expect(page.getByText('~20 min')).toBeVisible()

  await page.getByLabel('Game length (min)').fill('30')
  await expect(page.getByText('~30 min')).toBeVisible()
})

test('keeps the session after a reload', async ({ page }) => {
  await startSession(page, { location: 'Persistent Club' })
  await checkIn(page, FIVE)

  await page.reload()

  await expect(page.getByRole('heading', { name: 'Persistent Club' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Court 1' }).getByText('In play')).toBeVisible()
  await expect(page.getByText('Queue (1)')).toBeVisible()
})

test('keeps working offline', async ({ page, context }) => {
  await startSession(page)
  await checkIn(page, FIVE)

  await context.setOffline(true)
  await page.getByRole('region', { name: 'Court 1' }).getByRole('button', { name: 'Team A won' }).click()
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
