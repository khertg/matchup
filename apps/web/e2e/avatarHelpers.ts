import { expect, type Locator, type Page } from '@playwright/test'

/** A real 1x1 PNG: a small valid picture for the photo picker. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

/** A player's avatar, wherever it is on the page. */
export const avatarOf = (scope: Page | Locator, name: string) => scope.getByRole('img', { name: `${name}'s avatar` })

/** The queue rows on the Board (an ordered list), not the Next up card's list. */
export const queueRow = (page: Page, name: string) =>
  page.locator('ol > li').filter({ hasText: /Lv \d/ }).filter({ hasText: name })

/** Tap a player's small avatar to see it large. Returns the large view. */
export async function viewAvatar(page: Page, name: string, scope: Page | Locator = page) {
  await scope.getByRole('button', { name: `View ${name}'s avatar` }).first().click()
  const view = page.getByRole('dialog', { name, exact: true })
  await expect(view).toBeVisible()
  return view
}

/** Open the avatar editor for a player: tap the avatar, then Change avatar in the large view. */
export async function openAvatarEditor(page: Page, name: string, scope: Page | Locator = page) {
  const view = await viewAvatar(page, name, scope)
  await view.getByRole('button', { name: 'Change avatar' }).click()
  const dialog = page.getByRole('dialog', { name: `Avatar for ${name}` })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Give a player an emoji avatar. */
export async function setEmojiAvatar(page: Page, name: string, emoji: string) {
  const dialog = await openAvatarEditor(page, name)
  await dialog.getByRole('button', { name: `Emoji ${emoji}` }).click()
  await dialog.getByRole('button', { name: 'Save avatar' }).click()
  await expect(dialog).toHaveCount(0)
}

/** Give a player a photo avatar from a picture file. */
export async function setPhotoAvatar(page: Page, name: string, file = TINY_PNG) {
  const dialog = await openAvatarEditor(page, name)
  await dialog.getByLabel('Choose a photo file').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: file })
  // The crop step comes next: keep the centred crop it starts with.
  await page.getByRole('dialog', { name: `Crop photo for ${name}` }).getByRole('button', { name: 'Use photo' }).click()
  await expect(avatarOf(dialog, name)).toHaveAttribute('data-avatar-kind', 'photo')
  await dialog.getByRole('button', { name: 'Save avatar' }).click()
  await expect(dialog).toHaveCount(0)
}
