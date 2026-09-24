import { expect, test, type Browser, type Page } from '@playwright/test'
import { failOnCspViolations } from '../cspWatch'
import { checkIn, openSessionMenu, recordWin, startGame, startSession } from '../helpers'
import { apiCreateClub, expectSignedIn, uiLogin, uniqueClub, type TestClub } from './support'

failOnCspViolations(test)

/** Seconds a change may take to reach the other device: a short send delay plus the live stream. */
const FOLLOW = { timeout: 10_000 }

async function signIn(page: Page, club: TestClub) {
  await page.goto('/')
  await uiLogin(page, club)
  await expectSignedIn(page)
}

async function secondDevice(browser: Browser, club: TestClub) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' })
  const page = await context.newPage()
  await signIn(page, club)
  return { context, page }
}

// Queue rows, not the toasts (also an ordered list) that say who was checked in.
const queued = (page: Page, name: string) => page.locator('ol:not([data-sonner-toaster]) > li').filter({ hasText: name })
const court = (page: Page, name = 'Court 1') => page.getByRole('region', { name, exact: true })

test.describe('two staff devices running one session', () => {
  test('join from the setup screen, then changes on either show on both', async ({ page, browser, request }) => {
    const club = uniqueClub('Coop')
    await apiCreateClub(request, club)
    const pc = await secondDevice(browser, club)

    // The phone starts the session while the PC waits on its setup screen: Join appears without a reload.
    await signIn(page, club)
    await startSession(page, { location: 'Co-op Night' })
    await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee'])
    await pc.page.getByRole('button', { name: 'Join “Co-op Night”' }).click(FOLLOW)
    await expect(pc.page.getByRole('heading', { name: 'Co-op Night' })).toBeVisible()
    await expect(queued(pc.page, 'Dee')).toBeVisible()

    // A check-in on the PC reaches the phone; a game and its score on the phone reach the PC.
    await checkIn(pc.page, ['Eve'])
    await expect(queued(page, 'Eve')).toBeVisible(FOLLOW)
    await startGame(page)
    await expect(court(pc.page).getByText('In play')).toBeVisible(FOLLOW)
    await recordWin(page, 'Court 1', 'A', [11, 4])
    await expect(pc.page.getByRole('group', { name: 'Matches' })).toContainText('Matches (1)', FOLLOW)

    // Each device changes something while the phone is offline; afterwards both have both changes.
    await page.context().setOffline(true)
    await checkIn(page, ['Fay'])
    await checkIn(pc.page, ['Gus'])
    await page.context().setOffline(false)
    for (const device of [page, pc.page]) {
      await expect(queued(device, 'Fay')).toBeVisible(FOLLOW)
      await expect(queued(device, 'Gus')).toBeVisible(FOLLOW)
    }
    await pc.context.close()
  })

  test('when both finish the same game, the first result stands and the other device is told', async ({ page, browser, request }) => {
    const club = uniqueClub('Clash')
    await apiCreateClub(request, club)
    await signIn(page, club)
    await startSession(page, { location: 'Clash Night' })
    await checkIn(page, ['Ann', 'Bob', 'Cy', 'Dee'])
    await startGame(page)
    const pc = await secondDevice(browser, club)
    await pc.page.getByRole('button', { name: 'Join “Clash Night”' }).click(FOLLOW)
    await expect(court(pc.page).getByText('In play')).toBeVisible()

    // The phone is offline when it records Court 1; the PC records it, and the club has the PC's first.
    await page.context().setOffline(true)
    await recordWin(page, 'Court 1', 'B', [4, 11])
    await recordWin(pc.page, 'Court 1', 'A', [11, 7])
    await expect
      .poll(async () => ((await (await request.get(`/api/clubs/${club.slug}/live`)).json()) as { state: { courts: { teams: unknown }[] } }).state.courts[0].teams)
      .toBeNull()
    await page.context().setOffline(false)

    await expect(page.getByText(/Not applied, changed on another device/).first()).toBeVisible(FOLLOW)
    const matches = page.getByRole('group', { name: 'Matches' })
    await expect(matches).toContainText('Matches (1)')
    await expect(matches).toContainText('11')
    await expect(matches).toContainText('7')
    await pc.context.close()
  })

  test('ending on one device takes the other back to its setup screen', async ({ page, browser, request }) => {
    const club = uniqueClub('Ending')
    await apiCreateClub(request, club)
    await signIn(page, club)
    await startSession(page, { location: 'Ending Night' })
    await checkIn(page, ['Ann', 'Bob'])
    const pc = await secondDevice(browser, club)
    await pc.page.getByRole('button', { name: 'Join “Ending Night”' }).click(FOLLOW)
    await expect(pc.page.getByRole('heading', { name: 'Ending Night' })).toBeVisible()

    await openSessionMenu(pc.page)
    await pc.page.getByRole('button', { name: 'End session' }).click()
    await pc.page.getByRole('dialog').getByRole('button', { name: /^(Save and end session|End session)$/ }).click()
    await expect(pc.page.getByText('Set up an open play session')).toBeVisible()

    await expect(page.getByText('“Ending Night” was ended on another device')).toBeVisible(FOLLOW)
    await expect(page.getByText('Set up an open play session')).toBeVisible()
    await pc.context.close()
  })

  test('a second session started elsewhere is flagged, and staff choose which one runs', async ({ page, browser, request }) => {
    const club = uniqueClub('Two')
    await apiCreateClub(request, club)
    await signIn(page, club)
    await startSession(page, { location: 'First Night' })
    await checkIn(page, ['Ann'])

    // The PC starts its own instead of joining: it is told, and can join the running one.
    const pc = await secondDevice(browser, club)
    await expect(pc.page.getByRole('button', { name: 'Join “First Night”' })).toBeVisible(FOLLOW)
    await startSession(pc.page, { location: 'Second Night' })
    await checkIn(pc.page, ['Zed'])
    const banner = pc.page.getByRole('alert').filter({ hasText: 'Another staff device is running “First Night”' })
    await expect(banner).toBeVisible(FOLLOW)
    await banner.getByRole('button', { name: 'Join “First Night”' }).click()
    await expect(pc.page.getByRole('heading', { name: 'First Night' })).toBeVisible()
    await expect(queued(pc.page, 'Ann')).toBeVisible()
    await pc.context.close()
  })
})
