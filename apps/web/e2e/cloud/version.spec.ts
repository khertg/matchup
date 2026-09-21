import { expect, test } from '@playwright/test'
import { apiCreateClub, apiPublish, uniqueClub } from './support'

const VERSION = /^v\d+\.\d+\.\d+ · \S+/

test.describe('version number with the cloud', () => {
  test('is shown on the players\' live page', async ({ page, request }) => {
    const club = uniqueClub('Versioned')
    const { token } = await apiCreateClub(request, club)
    await apiPublish(request, token)
    await page.goto(`/club/${club.slug}`)
    await expect(page.getByRole('heading', { name: 'Sunset Courts' })).toBeVisible()
    await expect(page.getByTestId('app-version')).toHaveText(VERSION)
  })

  test('is shown to staff before and after they log in', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()
    await expect(page.getByTestId('app-version')).toHaveText(VERSION)
  })

  test('the API reports its own build on the health check', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(typeof body.version).toBe('string')
    expect(typeof body.commit).toBe('string')
  })
})
