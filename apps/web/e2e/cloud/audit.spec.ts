import { expect, test, type Browser, type Page } from '@playwright/test'
import { failOnCspViolations } from '../cspWatch'
import { checkIn, openSessionMenu, startGame, startSession } from '../helpers'
import { apiCreateClub, nameDevice, uniqueClub, type TestClub } from './support'

failOnCspViolations(test)

/** The same phone twice: two iPhone 16s say exactly the same about themselves. */
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const FOLLOW = { timeout: 15_000 }

async function iPhone(browser: Browser) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    serviceWorkers: 'block',
    userAgent: IPHONE,
    viewport: { width: 393, height: 852 },
    hasTouch: true,
    isMobile: true,
  })
  return { context, page: await context.newPage() }
}

/** Log in and land on the naming step, without naming the device yet. */
async function logIn(page: Page, club: TestClub) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Log in' }).click()
  const dialog = page.getByRole('dialog', { name: 'Log in to your club' })
  await dialog.getByLabel('Club link name').fill(club.slug)
  await dialog.getByLabel('Password').fill(club.password)
  await dialog.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByLabel('Device name')).toBeVisible()
}

async function openActivity(page: Page) {
  await openSessionMenu(page)
  await page.getByRole('button', { name: 'Activity' }).click()
  return page.getByRole('dialog', { name: 'Session activity' })
}

test('tells two identical iPhones apart, and shows who did what', async ({ browser, request }) => {
  test.setTimeout(90_000)
  const club = uniqueClub('Audit')
  await apiCreateClub(request, club)
  const desk = await iPhone(browser)
  const maria = await iPhone(browser)

  // Each iPhone is asked for a name; the second cannot take the first one's.
  await logIn(desk.page, club)
  await expect(desk.page.getByText(/This device: iPhone · iOS 18 · Safari #[0-9a-f]{4}/)).toBeVisible()
  await nameDevice(desk.page, 'Desk')
  await logIn(maria.page, club)
  await maria.page.getByLabel('Device name').fill('desk')
  await maria.page.getByRole('button', { name: 'Continue' }).click()
  await expect(maria.page.getByRole('alert')).toContainText('Another device of this club already has that name')
  await nameDevice(maria.page, 'Maria')

  // Desk starts the session and checks players in; Maria joins and starts a game.
  await startSession(desk.page, { location: 'Audit Night' })
  await checkIn(desk.page, ['Ann', 'Bob', 'Cy', 'Dee'])
  await maria.page.getByRole('button', { name: 'Join “Audit Night”' }).click(FOLLOW)
  await expect(maria.page.getByRole('heading', { name: 'Audit Night' })).toBeVisible()
  await startGame(maria.page)

  // Both devices see both devices' changes, each under its own name.
  for (const page of [desk.page, maria.page]) {
    const activity = await openActivity(page)
    const rows = activity.getByRole('list', { name: 'Activity' }).getByRole('listitem')
    await expect(rows.filter({ hasText: 'Checked in Ann' }).filter({ hasText: 'Desk' })).toHaveCount(1, FOLLOW)
    await expect(rows.filter({ hasText: /^Court 1: started / }).filter({ hasText: 'Maria' })).toHaveCount(1, FOLLOW)
    await expect(rows.filter({ hasText: 'Started “Audit Night”' }).filter({ hasText: 'Desk' })).toHaveCount(1)
    await expect(rows.filter({ hasText: 'Joined “Audit Night”' }).filter({ hasText: 'Maria' })).toHaveCount(1)
    await page.keyboard.press('Escape')
  }

  // The club-wide log can show one device only.
  await openSessionMenu(desk.page)
  await desk.page.getByRole('button', { name: 'End session' }).click()
  await desk.page.getByRole('dialog').getByRole('button', { name: 'End session' }).click()
  await desk.page.getByRole('button', { name: 'Club activity' }).click()
  const clubLog = desk.page.getByRole('dialog', { name: 'Club activity' })
  const rows = clubLog.getByRole('list', { name: 'Activity' }).getByRole('listitem')
  await expect(rows.filter({ hasText: 'Ended “Audit Night”' })).toHaveCount(1, FOLLOW)
  await clubLog.getByLabel('Show activity of').click()
  await desk.page.getByRole('option', { name: /^Maria · iPhone/ }).click()
  await expect(rows.filter({ hasText: /^Court 1: started / })).toHaveCount(1, FOLLOW)
  await expect(rows.filter({ hasText: 'Desk' })).toHaveCount(0)
  await desk.page.keyboard.press('Escape')

  // Past sessions show the session's own log.
  await desk.page.getByRole('button', { name: 'Past sessions' }).click()
  await desk.page.getByRole('button', { name: /Audit Night/ }).first().click()
  await desk.page.getByRole('button', { name: 'Activity' }).click()
  const pastLog = desk.page.getByRole('dialog', { name: 'Session activity' })
  await expect(pastLog.getByRole('listitem').filter({ hasText: 'Checked in Ann' })).toHaveCount(1, FOLLOW)

  await desk.context.close()
  await maria.context.close()
})
