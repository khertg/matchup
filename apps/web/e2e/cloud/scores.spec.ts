import { expect, test } from '@playwright/test'
import { checkIn, recordWin, startGame } from '../helpers'
import { apiCreateClub, apiLive, expectSignedIn, uiLogin, uniqueClub } from './support'

test.describe('scores on the live board', () => {
  test('a player’s phone sees the score of a game as soon as staff enter it', async ({ page, browser, request }) => {
    const club = uniqueClub('Scored')
    await apiCreateClub(request, club)
    const viewerContext = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      serviceWorkers: 'block',
    })
    const viewer = await viewerContext.newPage()

    await page.goto('/')
    await uiLogin(page, club)
    await expectSignedIn(page)
    await page.getByLabel('Location').fill('Scored Night')
    await page.getByRole('button', { name: 'Singles' }).click()
    await page.getByRole('button', { name: 'Start session' }).click()
    await expect(page.getByRole('heading', { name: 'Scored Night' })).toBeVisible()
    await checkIn(page, ['Ann', 'Bob'])
    await startGame(page)

    await recordWin(page, 'Court 1', 'A', [11, 4])

    // The public board carries the points, the scored game and the time (none to speak of yet).
    await expect
      .poll(async () => {
        const response = await apiLive(request, club.slug)
        if (!response.ok()) return null
        const stats = Object.values((await response.json()).state.stats) as Record<string, number>[]
        return stats.map((s) => [s.pointsFor, s.pointsAgainst, s.scoredGames]).sort((a, b) => a[0] - b[0])
      })
      .toEqual([
        [4, 11, 1],
        [11, 4, 1],
      ])

    await viewer.goto(`/club/${club.slug}`)
    await viewer.getByRole('tab', { name: 'Standings' }).click()
    const rows = viewer.getByRole('row')
    await expect(rows.nth(1)).toContainText('Ann', { timeout: 8000 })
    await expect(rows.nth(1).getByRole('cell').nth(6)).toHaveText('+7')
    await expect(rows.nth(2).getByRole('cell').nth(6)).toHaveText('-7')

    await viewerContext.close()
  })
})
