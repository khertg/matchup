import { slugify } from '@matchup/shared'
import { expect, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Helpers for the full-stack tests. They run against the real API (see
 * playwright.config.ts), so every test creates its own uniquely named club and
 * never depends on what another test left behind.
 */

let counter = 0

export function uniqueClub(label = 'Club') {
  const name = `${label} ${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`
  return { name, slug: slugify(name), password: 'secret-pass' }
}

export type TestClub = ReturnType<typeof uniqueClub>

// ---- talking to the API directly, for set-up and checks ---------------------

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

export async function apiCreateClub(request: APIRequestContext, club: TestClub) {
  const response = await request.post('/api/clubs', { data: club })
  expect(response.status(), await response.text()).toBe(201)
  return (await response.json()) as { token: string; recoveryCode: string }
}

/** A minimal but valid live session, as the web app would publish it. */
export function liveSnapshot(location = 'Sunset Courts') {
  return {
    schemaVersion: 1,
    location,
    mode: 'doubles',
    matchmaking: 'skill',
    avgGameMinutes: 12,
    courts: [
      { id: 1, teams: [[1, 2], [3, 4]] },
      { id: 2, teams: null },
    ],
    queue: [5, 6],
    nextUp: [],
    onBreak: [],
    partners: [[5, 6]],
    stats: {
      // Two scored games and 21 minutes on court each: the winners are +8, the losers -8.
      1: { games: 2, wins: 2, losses: 0, opponentSkill: 6, pointsFor: 22, pointsAgainst: 14, scoredGames: 2, secondsPlayed: 1260 },
      2: { games: 2, wins: 2, losses: 0, opponentSkill: 6, pointsFor: 22, pointsAgainst: 14, scoredGames: 2, secondsPlayed: 1260 },
      3: { games: 2, wins: 0, losses: 2, opponentSkill: 6, pointsFor: 14, pointsAgainst: 22, scoredGames: 2, secondsPlayed: 1260 },
      4: { games: 2, wins: 0, losses: 2, opponentSkill: 6, pointsFor: 14, pointsAgainst: 22, scoredGames: 2, secondsPlayed: 1260 },
    },
    players: {
      1: { id: 1, name: 'Ann', skill: 3 },
      2: { id: 2, name: 'Bob', skill: 3 },
      3: { id: 3, name: 'Cy', skill: 4 },
      4: { id: 4, name: 'Dee', skill: 4 },
      5: { id: 5, name: 'Eve', skill: 2 },
      6: { id: 6, name: 'Fay', skill: 2 },
    },
  }
}

export async function apiPublish(
  request: APIRequestContext,
  token: string,
  snapshot: object = liveSnapshot(),
) {
  const location = (snapshot as { location: string }).location
  const response = await request.put('/api/session', {
    headers: bearer(token),
    data: {
      public: snapshot,
      full: { schemaVersion: 1, storeVersion: 4, location, session: { note: 'private backup' } },
    },
  })
  expect(response.status(), await response.text()).toBe(200)
}

export const apiLive = (request: APIRequestContext, slug: string) =>
  request.get(`/api/clubs/${slug}/live`)

/** The staff token the app kept after signing in. */
export async function storedToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('matchup-club')
    return raw ? (JSON.parse(raw) as { state: { club: { token: string } | null } }).state.club?.token : null
  })
  if (!token) throw new Error('Not signed in to a club in this page')
  return token
}

// ---- the sign-in screens ----------------------------------------------------

/** Read the recovery code from its dialog, confirm it is saved, and return it. */
export async function confirmRecoveryCode(page: Page): Promise<string> {
  const dialog = page.getByRole('dialog', { name: 'Save your recovery code' })
  await expect(dialog).toBeVisible()
  const code = (await dialog.getByLabel('Recovery code').textContent())?.trim() ?? ''
  expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){4}$/)
  await dialog.getByLabel('I have saved this code somewhere safe').check()
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(dialog).toHaveCount(0)
  return code
}

/** Create a club through the UI and return its recovery code. */
export async function uiCreateClub(page: Page, club: TestClub): Promise<string> {
  await page.getByRole('button', { name: 'Create a club' }).click()
  const dialog = page.getByRole('dialog', { name: 'Create a club' })
  await dialog.getByLabel('Club name').fill(club.name)
  await dialog.getByLabel(/^Password/).fill(club.password)
  await dialog.getByRole('button', { name: 'Create club' }).click()
  return confirmRecoveryCode(page)
}

export async function uiLogin(page: Page, club: Pick<TestClub, 'slug' | 'password'>) {
  await page.getByRole('button', { name: 'Log in' }).click()
  const dialog = page.getByRole('dialog', { name: 'Log in to your club' })
  await dialog.getByLabel('Club link name').fill(club.slug)
  await dialog.getByLabel('Password').fill(club.password)
  await dialog.getByRole('button', { name: 'Log in' }).click()
}

/** Wait until the app shows the signed-in club panel. */
export const expectSignedIn = (page: Page) =>
  expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
