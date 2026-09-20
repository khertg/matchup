import { expect, test, type Page } from '@playwright/test'
import { checkIn, startSession } from '../helpers'
import { fullBackup, mockCloud, rpcError } from './mock'

async function createClub(page: Page, name = 'Downtown Pickle Club', password = 'secret') {
  await page.getByRole('button', { name: 'Create a club' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Club name').fill(name)
  await dialog.getByLabel(/^Password/).fill(password)
  await dialog.getByRole('button', { name: 'Create club' }).click()
}

async function logIn(page: Page, slug = 'downtown-pickle-club', password = 'secret') {
  await page.getByRole('button', { name: 'Log in' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Club link name').fill(slug)
  await dialog.getByLabel('Password').fill(password)
  await dialog.getByRole('button', { name: 'Log in' }).click()
}

test.describe('club sign-in', () => {
  test('offers to create a club or log in when cloud is configured', async ({ page }) => {
    await mockCloud(page)
    await page.goto('/')
    await expect(page.getByText('Cloud club')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create a club' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()
  })

  test('creates a club and shows its live link', async ({ page }) => {
    const mock = await mockCloud(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Create a club' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Club name').fill('Downtown Pickle Club')
    await expect(dialog.getByText('/club/downtown-pickle-club')).toBeVisible()

    // Passwords need at least four characters.
    await dialog.getByLabel(/^Password/).fill('abc')
    await expect(dialog.getByRole('button', { name: 'Create club' })).toBeDisabled()
    await dialog.getByLabel(/^Password/).fill('secret')
    await dialog.getByRole('button', { name: 'Create club' }).click()

    await expect(page.getByText('Downtown Pickle Club')).toBeVisible()
    await expect(page.getByText('/club/downtown-pickle-club', { exact: true })).toBeVisible()
    expect(mock.callsTo('create_club')[0].body).toEqual({
      p_name: 'Downtown Pickle Club',
      p_slug: 'downtown-pickle-club',
      p_password: 'secret',
    })
  })

  test('explains when the club URL is already taken', async ({ page }) => {
    const mock = await mockCloud(page)
    mock.overrides.create_club = () => rpcError('club_slug_taken')
    await page.goto('/')
    await createClub(page)
    await expect(page.getByRole('alert')).toContainText('already taken')
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('logs in to an existing club', async ({ page }) => {
    await mockCloud(page)
    await page.goto('/')
    await logIn(page)
    await expect(page.getByText('Downtown Club', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
  })

  test('rejects a wrong password without signing in', async ({ page }) => {
    await mockCloud(page)
    await page.goto('/')
    await logIn(page, 'downtown-pickle-club', 'nope')
    await expect(page.getByRole('alert')).toHaveText('Wrong club URL or password.')
    await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)
  })

  test('stays signed in after a reload and can log out', async ({ page }) => {
    const mock = await mockCloud(page)
    await page.goto('/')
    await logIn(page)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()

    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page.getByRole('button', { name: 'Create a club' })).toBeVisible()
    await expect.poll(() => mock.callsTo('club_logout').length).toBe(1)
    expect(mock.callsTo('club_logout')[0].body).toEqual({ p_token: 'token-login' })
  })
})

test.describe('publishing the live session', () => {
  test('publishes changes with a staff token and no private details', async ({ page }) => {
    const mock = await mockCloud(page)
    await page.goto('/')
    await logIn(page)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()

    // Start from the setup screen the app already shows, without navigating away.
    await page.getByLabel('Location').fill('Downtown Open')
    await page.getByRole('button', { name: 'Start session' }).click()
    await checkIn(page, [{ name: 'Ann', gender: 'Female' }, 'Bob'])

    await expect.poll(() => mock.callsTo('publish_session').length).toBeGreaterThan(0)
    const latest = mock.callsTo('publish_session').at(-1)!.body as {
      p_token: string
      p_public: { location: string; queue: number[] }
      p_full: { session: unknown }
    }
    expect(latest.p_token).toBe('token-login')
    expect(latest.p_public.location).toBe('Downtown Open')
    expect(JSON.stringify(latest.p_public)).not.toContain('gender')
    expect(JSON.stringify(latest.p_full)).toContain('gender')
    await expect(page.getByRole('status')).toHaveText('Live and synced')
  })

  test('holds changes while offline and sends them when the connection returns', async ({ page, context }) => {
    const mock = await mockCloud(page)
    await page.goto('/')
    await logIn(page)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
    await page.getByRole('button', { name: 'Start session' }).click()
    await expect.poll(() => mock.callsTo('publish_session').length).toBeGreaterThan(0)
    const before = mock.callsTo('publish_session').length

    await context.setOffline(true)
    await checkIn(page, ['Ann', 'Bob'])
    await expect(page.getByRole('status')).toHaveText('Offline, will sync')
    await page.waitForTimeout(1500)
    expect(mock.callsTo('publish_session').length).toBe(before)

    await context.setOffline(false)
    await expect.poll(() => mock.callsTo('publish_session').length).toBeGreaterThan(before)
    const latest = mock.callsTo('publish_session').at(-1)!.body as { p_public: { queue: number[] } }
    expect(latest.p_public.queue).toHaveLength(2)
    await expect(page.getByRole('status')).toHaveText('Live and synced')
  })

  test('clears the live session when the session ends', async ({ page }) => {
    const mock = await mockCloud(page)
    await page.goto('/')
    await logIn(page)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
    await page.getByRole('button', { name: 'Start session' }).click()
    await expect.poll(() => mock.callsTo('publish_session').length).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'End session' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'End session' }).click()
    await expect.poll(() => mock.callsTo('clear_session').length).toBe(1)
    expect(mock.callsTo('clear_session')[0].body).toEqual({ p_token: 'token-login' })
  })

  test('signs out with a clear message when the club login has expired', async ({ page }) => {
    const mock = await mockCloud(page)
    mock.overrides.publish_session = () => rpcError('invalid_token')
    await page.goto('/')
    await logIn(page)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
    await page.getByRole('button', { name: 'Start session' }).click()

    await expect(page.getByText('Your club login expired. Please log in again.').first()).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
  })

  test('does not publish anything without a club login', async ({ page }) => {
    const mock = await mockCloud(page)
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    await page.waitForTimeout(1500)
    expect(mock.callsTo('publish_session')).toHaveLength(0)
    await expect(page.getByRole('status')).toHaveCount(0)
  })
})

test.describe('sharing', () => {
  test('shows the live link and a QR code', async ({ page }) => {
    await mockCloud(page)
    await page.goto('/')
    await logIn(page)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
    await page.getByRole('button', { name: 'Start session' }).click()

    await page.getByRole('button', { name: 'Share live view' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Live board link')).toHaveValue(
      'http://localhost:4174/club/downtown-pickle-club',
    )
    const qr = dialog.getByRole('img', { name: 'QR code for the live board' })
    await expect(qr).toBeVisible()
    expect(await qr.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  })
})

test.describe('resuming on another device', () => {
  test('offers a session saved by another staff device and loads it', async ({ page }) => {
    await mockCloud(page, { fullSession: fullBackup })
    await page.goto('/')
    await logIn(page)

    await page.getByRole('button', { name: /Resume .Saved Club Night. from the cloud/ }).click()
    await expect(page.getByRole('heading', { name: 'Saved Club Night' })).toBeVisible()
    const court = page.getByRole('region', { name: 'Court 1' })
    for (const name of ['Ann', 'Bob', 'Cy', 'Dee']) await expect(court.getByText(name)).toBeVisible()
    await expect(page.getByText('Queue (1)')).toBeVisible()
  })

  test('shows no resume button when nothing is running in the cloud', async ({ page }) => {
    await mockCloud(page, { fullSession: null })
    await page.goto('/')
    await logIn(page)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Resume/ })).toHaveCount(0)
  })
})

test.describe('club leaderboard', () => {
  async function playAndEnd(page: Page) {
    await page.goto('/')
    await logIn(page)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
    await page.getByRole('button', { name: 'Singles' }).click()
    await page.getByRole('button', { name: 'Start session' }).click()
    await checkIn(page, ['Ann', 'Bob'])
    await page.getByRole('region', { name: 'Court 1' }).getByRole('button', { name: 'Team A won' }).click()
    await page.getByRole('button', { name: 'End session' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Save and end session' }).click()
  }

  test('uploads the finished session to the club leaderboard', async ({ page }) => {
    const mock = await mockCloud(page)
    await playAndEnd(page)

    await expect.poll(() => mock.callsTo('record_lifetime').length).toBe(1)
    const body = mock.callsTo('record_lifetime')[0].body as {
      p_token: string
      p_batch: string
      p_players: { name: string; games: number; wins: number; losses: number }[]
    }
    expect(body.p_token).toBe('token-login')
    expect(body.p_batch).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.p_players.map((p) => p.name).sort()).toEqual(['Ann', 'Bob'])
    expect(body.p_players.find((p) => p.name === 'Ann')).toMatchObject({ games: 1, wins: 1, losses: 0 })
    await expect(page.getByText('Session saved to the all-time leaderboard')).toBeVisible()
  })

  test('keeps the totals and retries with the same batch id after a failed upload', async ({ page }) => {
    const mock = await mockCloud(page)
    mock.down = false
    // The first upload attempt fails as if the connection dropped.
    let attempts = 0
    mock.overrides.record_lifetime = () => {
      attempts += 1
      return attempts === 1 ? { status: 503, body: { message: 'Failed to fetch' } } : { status: 204 }
    }
    await playAndEnd(page)

    await expect(page.getByText(/Saved on this device/)).toBeVisible()
    await expect.poll(() => mock.callsTo('record_lifetime').length).toBe(1)

    // Connectivity returns: the queued batch is sent again, unchanged.
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(() => mock.callsTo('record_lifetime').length).toBe(2)
    const [first, second] = mock.callsTo('record_lifetime').map((c) => c.body.p_batch)
    expect(second).toBe(first)

    // Nothing is left to send.
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.waitForTimeout(500)
    expect(mock.callsTo('record_lifetime')).toHaveLength(2)
  })

  test('shows the combined club results when signed in', async ({ page }) => {
    await mockCloud(page, {
      clubPlayers: [
        { name: 'Zoe', games: 12, wins: 9, losses: 3 },
        { name: 'Yan', games: 8, wins: 2, losses: 6 },
      ],
    })
    await page.goto('/')
    await logIn(page)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()

    await page.getByRole('button', { name: 'Lifetime leaderboard' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/Combined all-time results for Downtown Club/)).toBeVisible()
    await expect(dialog.getByRole('row').nth(1)).toContainText('Zoe')
    await expect(dialog.getByRole('row').nth(1)).toContainText('75%')
    await expect(dialog.getByRole('row').nth(2)).toContainText('Yan')
  })
})
