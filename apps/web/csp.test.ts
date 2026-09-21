import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONTENT_SECURITY_POLICY } from './csp'

describe('the Content-Security-Policy', () => {
  it('is the same in the production Caddyfile as in the app, so tests run under what production sends', () => {
    const caddyfile = readFileSync(path.resolve(import.meta.dirname, '../../deploy/Caddyfile'), 'utf8')
    expect(caddyfile).toContain(`Content-Security-Policy "${CONTENT_SECURITY_POLICY}"`)
  })

  it('lets nothing run or load from anywhere but the app itself', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'")
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'")
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'")
    // No unsafe script execution, and no wildcard sources.
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*unsafe/)
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/(^|[\s;])\*(\s|;|$)/)
  })
})
