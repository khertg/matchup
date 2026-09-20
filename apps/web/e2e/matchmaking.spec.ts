import { expect, test } from '@playwright/test'
import { checkIn, choose, startSession } from './helpers'

const MODES = ['Auto-balanced', 'Skill-separated', 'Winners vs. Losers', 'Mixed doubles']

test('offers matchmaking modes for doubles only', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Matchmaking')).toBeVisible()
  await expect(page.getByText('First come, first served, with teams split evenly by skill.')).toBeVisible()

  await choose(page, 'Matchmaking', 'Mixed doubles')
  await expect(page.getByText(/Every team has one man and one woman/)).toBeVisible()

  await page.getByRole('button', { name: 'Singles' }).click()
  await expect(page.getByLabel('Matchmaking')).toHaveCount(0)
})

for (const mode of MODES) {
  test(`starts a session in ${mode} mode`, async ({ page }) => {
    await startSession(page, { matchmaking: mode })
    await expect(page.getByText(mode, { exact: true })).toBeVisible()
  })
}

test.describe('mixed doubles', () => {
  test('requires a gender at check-in', async ({ page }) => {
    await startSession(page, { matchmaking: 'Mixed doubles' })
    await page.getByRole('tab', { name: 'Check-in' }).click()
    await expect(page.getByText('Gender (required for mixed doubles)')).toBeVisible()

    await page.getByLabel('Player name').fill('Alex')
    await expect(page.getByRole('button', { name: 'Check in', exact: true })).toBeDisabled()

    await choose(page, /^Gender/, 'Male')
    await expect(page.getByRole('button', { name: 'Check in', exact: true })).toBeEnabled()
  })

  test('waits for two men and two women, then stages the match', async ({ page }) => {
    await startSession(page, { matchmaking: 'Mixed doubles' })
    await checkIn(page, [
      { name: 'Alex', gender: 'Male' },
      { name: 'Ben', gender: 'Male' },
      { name: 'Carl', gender: 'Male' },
      { name: 'Dan', gender: 'Male' },
      { name: 'Eva', gender: 'Female' },
    ])
    const court = page.getByRole('region', { name: 'Court 1' })
    // Four men and one woman: no valid mixed group yet, so the court stays open.
    await expect(court.getByText('Open')).toBeVisible()
    await expect(court.getByRole('button', { name: 'Start with waiting players' })).toBeVisible()

    await checkIn(page, [{ name: 'Fay', gender: 'Female' }])
    await expect(court.getByText('In play')).toBeVisible()
    // The earliest two men and both women play; the other men wait.
    for (const name of ['Alex', 'Ben', 'Eva', 'Fay']) await expect(court.getByText(name)).toBeVisible()
    for (const name of ['Carl', 'Dan']) await expect(court.getByText(name)).toHaveCount(0)
    await expect(page.getByText('Queue (2)')).toBeVisible()
  })

  test('lets staff start an open court by hand', async ({ page }) => {
    await startSession(page, { matchmaking: 'Mixed doubles' })
    await checkIn(page, ['Alex', 'Ben', 'Carl', 'Dan'].map((name) => ({ name, gender: 'Male' as const })))
    const court = page.getByRole('region', { name: 'Court 1' })
    await court.getByRole('button', { name: 'Start with waiting players' }).click()
    await expect(page.getByText('Court 1 started')).toBeVisible()
    await expect(court.getByText('In play')).toBeVisible()
  })
})

test.describe('partner locking', () => {
  test('keeps locked partners on the same team', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob', 'Cy'])
    await page.getByRole('tab', { name: 'Check-in' }).click()
    await choose(page, 'First partner', 'Ann')
    await choose(page, 'Second partner', 'Cy')
    await page.getByRole('button', { name: 'Lock partners' }).click()
    await expect(page.getByText('Ann & Cy')).toBeVisible()

    await checkIn(page, ['Dee'])
    const court = page.getByRole('region', { name: 'Court 1' })
    await expect(court.getByText('In play')).toBeVisible()
    const annsTeam = court.getByRole('group').filter({ has: page.getByText('Ann') })
    await expect(annsTeam.getByText('Cy')).toBeVisible()
    await expect(annsTeam.getByLabel('Locked partners')).toBeVisible()
  })

  test('unlocks partners', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    await page.getByRole('tab', { name: 'Check-in' }).click()
    await choose(page, 'First partner', 'Ann')
    await choose(page, 'Second partner', 'Bob')
    await page.getByRole('button', { name: 'Lock partners' }).click()
    await expect(page.getByText('Ann & Bob')).toBeVisible()

    await page.getByRole('button', { name: 'Unlock Ann and Bob' }).click()
    await expect(page.getByText('Ann & Bob')).toHaveCount(0)
  })

  test('is not offered in singles', async ({ page }) => {
    await startSession(page, { mode: 'Singles' })
    await page.getByRole('tab', { name: 'Check-in' }).click()
    await expect(page.getByText('Locked partners always share a team')).toHaveCount(0)
  })

  test('shows a lock next to queued partners', async ({ page }) => {
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    await page.getByRole('tab', { name: 'Check-in' }).click()
    await choose(page, 'First partner', 'Ann')
    await choose(page, 'Second partner', 'Bob')
    await page.getByRole('button', { name: 'Lock partners' }).click()
    await page.getByRole('tab', { name: 'Board' }).click()
    await expect(page.getByLabel('Locked with Bob')).toBeVisible()
    await expect(page.getByLabel('Locked with Ann')).toBeVisible()
  })
})
