import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { setEmojiAvatar, viewAvatar } from '../avatarHelpers'
import { failOnCspViolations } from '../cspWatch'
import { checkIn, openSessionMenu, recordWin, startGame, startSession } from '../helpers'
import { apiCreateClub, expectSignedIn, uiLogin, uniqueClub, type TestClub } from './support'

failOnCspViolations(test)

const leaderboard = (request: APIRequestContext, slug: string) => async () =>
  (((await (await request.get(`/api/clubs/${slug}/players`)).json()).players as { name: string; games: number }[]) ?? []).map(
    (p) => `${p.name}:${p.games}`,
  )

const avatarKeys = (request: APIRequestContext, slug: string) => async () =>
  Object.keys((await (await request.get(`/api/clubs/${slug}/avatars`)).json()).avatars as Record<string, unknown>).sort()

async function signIn(page: Page, club: TestClub) {
  await page.goto('/')
  await uiLogin(page, club)
  await expectSignedIn(page)
}

/** One finished singles game with Ann and Bob, results saved to the club, and Ann has an emoji avatar. */
async function playAndSave(page: Page) {
  await startSession(page, { mode: 'Singles' })
  await checkIn(page, ['Ann', 'Bob'])
  await setEmojiAvatar(page, 'Ann', '🎾')
  await startGame(page)
  await recordWin(page)
  await openSessionMenu(page)
  await page.getByRole('button', { name: 'End session' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save and end session' }).click()
  await expect(page.getByText('Set up an open play session')).toBeVisible()
}

/** Rename a saved player from the roster list of a new session. */
async function renameFromRoster(page: Page, from: string, to: string) {
  await startSession(page, { mode: 'Singles' })
  await page.getByRole('tab', { name: 'Check-in' }).click()
  const roster = page.getByRole('group', { name: 'Check in from the roster' })
  const view = await viewAvatar(page, from, roster)
  await view.getByRole('button', { name: 'Edit name' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit name' })
  await dialog.getByLabel('Player name').fill(to)
  await dialog.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByText(`${from} is now ${to}`)).toBeVisible()
}

test.describe('renaming a player in the club cloud', () => {
  test('moves their all-time totals and shared avatar to the new name, and the live page shows it', async ({
    page,
    request,
    browser,
  }) => {
    const club = uniqueClub('Rename')
    await apiCreateClub(request, club)
    await signIn(page, club)
    await playAndSave(page)
    await expect.poll(leaderboard(request, club.slug)).toEqual(['Ann:1', 'Bob:1'])
    await expect.poll(avatarKeys(request, club.slug)).toEqual(['ann'])

    await renameFromRoster(page, 'Ann', 'Anne')

    // The club's copy moves: the totals and the avatar are under the new name, and nothing is left under the old one.
    await expect.poll(leaderboard(request, club.slug)).toEqual(['Anne:1', 'Bob:1'])
    await expect.poll(avatarKeys(request, club.slug)).toEqual(['anne'])

    // The players' live page shows the new name once she is checked in.
    await checkIn(page, ['Anne', 'Bob'])
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' })
    const live = await context.newPage()
    await live.goto(`/club/${club.slug}`)
    await expect(live.getByText('Anne').first()).toBeVisible()
    await expect(live.getByText('Ann', { exact: true })).toHaveCount(0)
    await context.close()
  })

  test('a rename made with no connection is sent when the connection returns', async ({ page, request }) => {
    const club = uniqueClub('Offline')
    await apiCreateClub(request, club)
    await signIn(page, club)
    await playAndSave(page)
    await expect.poll(leaderboard(request, club.slug)).toEqual(['Ann:1', 'Bob:1'])

    await page.route('**/api/**', (route) => route.abort('connectionrefused'))
    await renameFromRoster(page, 'Ann', 'Anne')
    // Still the old name at the club: it could not be told.
    expect(await leaderboard(request, club.slug)()).toEqual(['Ann:1', 'Bob:1'])

    await page.unroute('**/api/**')
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(leaderboard(request, club.slug)).toEqual(['Anne:1', 'Bob:1'])
    await expect.poll(avatarKeys(request, club.slug)).toEqual(['anne'])
  })

  test('another club is not affected', async ({ page, request }) => {
    const mine = uniqueClub('Mine')
    const other = uniqueClub('Other')
    await apiCreateClub(request, mine)
    const { token } = await apiCreateClub(request, other)
    await request.post('/api/lifetime', {
      headers: { authorization: `Bearer ${token}` },
      data: { batchId: '00000000-0000-4000-8000-000000000042', players: [{ name: 'Ann', games: 5, wins: 3, losses: 2 }] },
    })
    await signIn(page, mine)
    await playAndSave(page)
    await renameFromRoster(page, 'Ann', 'Anne')
    await expect.poll(leaderboard(request, mine.slug)).toEqual(['Anne:1', 'Bob:1'])
    expect(await leaderboard(request, other.slug)()).toEqual(['Ann:5'])
  })
})
