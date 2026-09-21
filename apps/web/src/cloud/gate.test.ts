import { describe, expect, it } from 'vitest'
import { requiresLogin } from './gate'

describe('requiresLogin', () => {
  it('asks a signed-out device to log in when a cloud is configured', () => {
    expect(requiresLogin({ cloudConfigured: true, signedIn: false, isViewerPath: false })).toBe(true)
  })

  it('lets a logged-in device straight in', () => {
    expect(requiresLogin({ cloudConfigured: true, signedIn: true, isViewerPath: false })).toBe(false)
  })

  it('never blocks a build with no cloud, since there is nothing to log in to', () => {
    expect(requiresLogin({ cloudConfigured: false, signedIn: false, isViewerPath: false })).toBe(false)
  })

  it('never blocks the public live page', () => {
    expect(requiresLogin({ cloudConfigured: true, signedIn: false, isViewerPath: true })).toBe(false)
  })
})
