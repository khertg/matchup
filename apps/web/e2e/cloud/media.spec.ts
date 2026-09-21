import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { failOnCspViolations } from '../cspWatch'
import { checkIn } from '../helpers'
import { avatarOf, openAvatarEditor, setEmojiAvatar, setLogo, setPhotoAvatar, viewAvatar } from '../avatarHelpers'
import { apiCreateClub, expectSignedIn, uiLogin, uniqueClub, type TestClub } from './support'

failOnCspViolations(test)

async function signIn(page: Page, club: TestClub) {
  await page.goto('/')
  await uiLogin(page, club)
  await expectSignedIn(page)
}

async function startSession(page: Page, location = 'Media Night') {
  await page.getByLabel('Location').fill(location)
  await page.getByRole('button', { name: 'Start session' }).click()
  await expect(page.getByRole('heading', { name: location })).toBeVisible()
}

async function viewerPage(browser: Browser, slug: string) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' })
  const page = await context.newPage()
  await page.goto(`/club/${slug}`)
  return { context, page }
}

const index = (request: APIRequestContext, slug: string) => async () => {
  const response = await request.get(`/api/clubs/${slug}/avatars`)
  return (await response.json()) as { avatars: Record<string, { kind: string; emoji?: string }>; logo: { v: number } | null }
}

const shareBox = (page: Page) => page.getByLabel('Show player photos on the live page')

test.describe('club media on the live page', () => {
  test('an emoji avatar and the logo reach the players’ live page, which cannot change them', async ({ page, browser, request }) => {
    const club = uniqueClub('Media')
    await apiCreateClub(request, club)
    await signIn(page, club)
    await setLogo(page)
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    await setEmojiAvatar(page, 'Ann', '🎾')

    await expect.poll(async () => (await index(request, club.slug)()).avatars.ann?.emoji).toBe('🎾')
    await expect.poll(async () => (await index(request, club.slug)()).logo).not.toBeNull()

    const { context, page: viewer } = await viewerPage(browser, club.slug)
    const row = viewer.locator('ol > li').filter({ hasText: 'Ann' })
    await expect(avatarOf(row, 'Ann')).toHaveAttribute('data-emoji', '🎾', { timeout: 20_000 })
    // Bob has none, so he shows the automatic initials.
    await expect(avatarOf(viewer.locator('ol > li').filter({ hasText: 'Bob' }), 'Bob')).toHaveAttribute('data-avatar-kind', 'initials')
    await expect(viewer.getByTestId('club-logo')).toHaveAttribute('src', new RegExp(`/api/clubs/${club.slug}/logo\\?v=\\d+`))
    // Players can tap an avatar to see it large, but nothing can be changed from the live page.
    const large = await viewAvatar(viewer, 'Ann', row)
    await expect(avatarOf(large, 'Ann')).toHaveAttribute('data-emoji', '🎾')
    await expect(large.getByRole('button', { name: 'Change avatar' })).toHaveCount(0)
    await viewer.keyboard.press('Escape')
    await expect(viewer.getByRole('button', { name: /^Change .*avatar/ })).toHaveCount(0)
    await expect(viewer.getByRole('button', { name: /club logo$/ })).toHaveCount(0)
    await context.close()
  })

  test('a change of avatar or logo reaches the live page without anyone reloading it', async ({ page, browser, request }) => {
    const club = uniqueClub('Change')
    await apiCreateClub(request, club)
    await signIn(page, club)
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    await setEmojiAvatar(page, 'Ann', '🎾')

    const { context, page: viewer } = await viewerPage(browser, club.slug)
    const row = viewer.locator('ol > li').filter({ hasText: 'Ann' })
    await expect(avatarOf(row, 'Ann')).toHaveAttribute('data-emoji', '🎾', { timeout: 20_000 })
    await setEmojiAvatar(page, 'Ann', '🏆')
    await expect(avatarOf(row, 'Ann')).toHaveAttribute('data-emoji', '🏆', { timeout: 30_000 })
    await context.close()
  })

  test('photos stay on staff devices until sharing is switched on, and come down when it is switched off', async ({ page, browser, request }) => {
    const club = uniqueClub('Photos')
    await apiCreateClub(request, club)
    await signIn(page, club)
    await expect(shareBox(page)).not.toBeChecked()
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    await setPhotoAvatar(page, 'Ann')
    await setEmojiAvatar(page, 'Bob', '🥇')

    // Bob's emoji is sent; Ann's photo is not.
    await expect.poll(async () => Object.keys((await index(request, club.slug)()).avatars)).toEqual(['bob'])
    const { context, page: viewer } = await viewerPage(browser, club.slug)
    await expect(avatarOf(viewer.locator('ol > li').filter({ hasText: 'Bob' }), 'Bob')).toHaveAttribute('data-emoji', '🥇', { timeout: 20_000 })
    await expect(avatarOf(viewer.locator('ol > li').filter({ hasText: 'Ann' }), 'Ann')).toHaveAttribute('data-avatar-kind', 'initials')
    expect((await request.get(`/api/clubs/${club.slug}/avatars/ann/photo`)).status()).toBe(404)

    // Switch sharing on from the running session (Share live view): the photo goes up.
    await page.getByRole('button', { name: 'Share live view' }).click()
    await shareBox(page).check()
    await expect.poll(async () => (await index(request, club.slug)()).avatars.ann?.kind).toBe('photo')
    const photo = await request.get(`/api/clubs/${club.slug}/avatars/ann/photo`)
    expect(photo.status()).toBe(200)
    expect(photo.headers()['content-type']).toMatch(/^image\//)

    // Switch it off: every photo comes down, the emoji stays.
    await shareBox(page).uncheck()
    await expect.poll(async () => Object.keys((await index(request, club.slug)()).avatars)).toEqual(['bob'])
    expect((await request.get(`/api/clubs/${club.slug}/avatars/ann/photo`)).status()).toBe(404)
    await context.close()

    // The choice is the same one the setup screen shows.
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'End session' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /^(Save and end session|End session)$/ }).click()
    await expect(shareBox(page)).not.toBeChecked()
  })

  test('with sharing on, the live page shows the photo, from the club', async ({ page, browser, request }) => {
    const club = uniqueClub('Shared')
    await apiCreateClub(request, club)
    await signIn(page, club)
    await shareBox(page).check()
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    await setPhotoAvatar(page, 'Ann')

    const { context, page: viewer } = await viewerPage(browser, club.slug)
    const avatar = avatarOf(viewer.locator('ol > li').filter({ hasText: 'Ann' }), 'Ann')
    await expect(avatar).toHaveAttribute('data-avatar-kind', 'photo', { timeout: 20_000 })
    await expect(avatar.locator('img')).toHaveAttribute('src', new RegExp(`/api/clubs/${club.slug}/avatars/ann/photo\\?v=\\d+`))
    await expect
      .poll(() => avatar.locator('img').evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0)
    await context.close()
  })

  test('another staff device shows the club’s avatar and logo for players it has none for', async ({ page, browser, request }) => {
    const club = uniqueClub('Devices')
    await apiCreateClub(request, club)
    await signIn(page, club)
    await setLogo(page)
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    await setEmojiAvatar(page, 'Ann', '🎾')
    await expect.poll(async () => (await index(request, club.slug)()).avatars.ann?.emoji).toBe('🎾')
    await expect.poll(async () => (await index(request, club.slug)()).logo).not.toBeNull()

    const other = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' })
    const second = await other.newPage()
    await signIn(second, club)
    await expect(second.getByTestId('club-logo')).toBeVisible({ timeout: 20_000 })
    await startSession(second, 'Second Device')
    await checkIn(second, ['Ann', 'Cy'])
    // Its own roster has no avatar for Ann, so the club's is used; Cy has none anywhere.
    await expect(avatarOf(second.locator('ol > li').filter({ hasText: 'Ann' }), 'Ann')).toHaveAttribute('data-emoji', '🎾', { timeout: 20_000 })
    await expect(avatarOf(second.locator('ol > li').filter({ hasText: 'Cy' }), 'Cy')).toHaveAttribute('data-avatar-kind', 'initials')
    await other.close()
  })

  test('changes made while offline are sent when the connection returns', async ({ page, context, request }) => {
    const club = uniqueClub('Offline')
    await apiCreateClub(request, club)
    await signIn(page, club)
    await startSession(page)
    await checkIn(page, ['Ann'])

    await context.setOffline(true)
    await setEmojiAvatar(page, 'Ann', '🏓')
    await page.waitForTimeout(1500)
    expect((await index(request, club.slug)()).avatars).toEqual({})

    await context.setOffline(false)
    await expect.poll(async () => (await index(request, club.slug)()).avatars.ann?.emoji, { timeout: 20_000 }).toBe('🏓')
  })

  test('a removed avatar and a removed logo are removed from the club too', async ({ page, request }) => {
    const club = uniqueClub('Removal')
    await apiCreateClub(request, club)
    await signIn(page, club)
    await setLogo(page)
    await startSession(page)
    await checkIn(page, ['Ann'])
    await setEmojiAvatar(page, 'Ann', '🎾')
    await expect.poll(async () => (await index(request, club.slug)()).avatars.ann?.kind).toBe('emoji')

    const editor = await openAvatarEditor(page, 'Ann')
    await editor.getByRole('button', { name: 'Remove avatar' }).click()
    await expect.poll(async () => Object.keys((await index(request, club.slug)()).avatars)).toEqual([])

    await page.getByRole('button', { name: 'End session' }).click()
    await page.getByRole('dialog').getByRole('button', { name: /^(Save and end session|End session)$/ }).click()
    await page.getByRole('button', { name: 'Change club logo' }).click()
    await page.getByRole('dialog', { name: 'Club logo' }).getByRole('button', { name: 'Remove logo' }).click()
    await expect.poll(async () => (await index(request, club.slug)()).logo).toBeNull()
  })
})

test.describe('two clubs on one device', () => {
  test("a logo that was not sent yet is never sent to the next club that logs in", async ({ page, request }) => {
    const clubA = uniqueClub('Alpha')
    const clubB = uniqueClub('Bravo')
    await apiCreateClub(request, clubA)
    await apiCreateClub(request, clubB)

    await signIn(page, clubA)
    // Alpha sets a logo with no connection: it stays on the device, waiting to be sent.
    await page.route('**/api/**', (route) => route.abort('connectionrefused'))
    await setLogo(page)
    await expect(page.getByTestId('club-logo')).toBeVisible()
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.unroute('**/api/**')

    await uiLogin(page, clubB)
    await expectSignedIn(page)
    await page.waitForTimeout(2000)
    expect((await index(request, clubB.slug)()).logo).toBeNull()
    expect((await index(request, clubA.slug)()).logo).toBeNull() // and Alpha still has not got it either
    // It is still on this device.
    await expect(page.getByTestId('club-logo')).toBeVisible()
  })
})
