import { expect, type Page, type test as base } from '@playwright/test'

const violations = new WeakMap<Page, string[]>()

/**
 * The preview server sends the same Content-Security-Policy as production, and the browser reports
 * anything it blocks as a console error. Call this once at the top of a spec so any test in it fails
 * when the app tries to load or run something the policy forbids.
 */
export function failOnCspViolations(t: typeof base) {
  t.beforeEach(async ({ page }) => {
    const seen: string[] = []
    violations.set(page, seen)
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to (load|apply|execute|connect|frame|create)/i.test(message.text())) {
        seen.push(message.text())
      }
    })
  })
  t.afterEach(async ({ page }) => {
    expect(violations.get(page) ?? [], 'the page broke the Content-Security-Policy').toEqual([])
  })
}
