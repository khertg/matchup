import { expect, test, type Page } from '@playwright/test'
import { checkIn, startSession } from './helpers'

const html = (page: Page) => page.locator('html')
const switchButton = (page: Page) => page.getByRole('button', { name: 'Colour theme' })
const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

async function choose(page: Page, label: 'Light' | 'Dark' | 'System') {
  await switchButton(page).click()
  await page.getByRole('menuitemradio', { name: label }).click()
}

test.describe('light and dark theme', () => {
  test.use({ colorScheme: 'light' })

  test('Dark switches the whole page to dark, and Light switches it back', async ({ page }) => {
    await page.goto('/')
    await expect(html(page)).not.toHaveClass(/dark/)
    const light = await background(page)

    await choose(page, 'Dark')
    await expect(html(page)).toHaveClass(/dark/)
    const dark = await background(page)
    expect(dark).not.toBe(light)

    await choose(page, 'Light')
    await expect(html(page)).not.toHaveClass(/dark/)
    expect(await background(page)).toBe(light)
  })

  test('remembers the choice after a reload', async ({ page }) => {
    await page.goto('/')
    await choose(page, 'Dark')
    await page.reload()
    await expect(html(page)).toHaveClass(/dark/)
    await choose(page, 'Light')
    await page.reload()
    await expect(html(page)).not.toHaveClass(/dark/)
  })

  test('System follows the device, including a change while the page is open', async ({ page }) => {
    await page.goto('/')
    await choose(page, 'System')
    await expect(html(page)).not.toHaveClass(/dark/)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(html(page)).toHaveClass(/dark/)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(html(page)).not.toHaveClass(/dark/)
  })

  test('starts on System, so a device set to dark opens dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(html(page)).toHaveClass(/dark/)
    await switchButton(page).click()
    await expect(page.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')
  })

  test('an explicit choice wins over the device setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await choose(page, 'Light')
    await expect(html(page)).not.toHaveClass(/dark/)
    await page.reload()
    await expect(html(page)).not.toHaveClass(/dark/)
  })

  test('is set before the app starts, so there is no flash of the wrong theme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
    // Keep the app itself from loading: only the tiny script in the page head can have set this.
    await page.route('**/assets/*.js', (route) => route.abort())
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(html(page)).toHaveClass(/dark/)
    expect(await html(page).evaluate((el) => (el as HTMLElement).style.colorScheme)).toBe('dark')
  })

  test('keeps the browser address bar colour in step with the theme', async ({ page }) => {
    await page.goto('/')
    const color = () => page.locator('meta[name="theme-color"]').getAttribute('content')
    const light = await color()
    await choose(page, 'Dark')
    await expect.poll(color).not.toBe(light)
    await choose(page, 'Light')
    await expect.poll(color).toBe(light)
  })

  test('is labelled, shows the current choice, and works from the keyboard', async ({ page }) => {
    await page.goto('/')
    await expect(switchButton(page)).toHaveAttribute('title', 'Colour theme: System')
    await switchButton(page).focus()
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByText('Colour theme')).toBeVisible()
    await expect(page.getByRole('menuitemradio', { name: 'Light' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(html(page)).toHaveClass(/dark/)
    await expect(switchButton(page)).toHaveAttribute('title', 'Colour theme: Dark')
    // Escape closes an open menu without changing anything.
    await page.keyboard.press('Tab')
    await switchButton(page).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(html(page)).toHaveClass(/dark/)
  })

  test('is on the setup screen and stays on the session screen, in the same corner', async ({ page }) => {
    await page.goto('/')
    await expect(switchButton(page)).toBeVisible()
    await startSession(page)
    await checkIn(page, ['Ann', 'Bob'])
    await expect(switchButton(page)).toBeVisible()
    await choose(page, 'Dark')
    await expect(html(page)).toHaveClass(/dark/)
    // The session itself is still usable in dark mode.
    await expect(page.getByRole('heading', { name: 'Test Club' })).toBeVisible()
  })
})
