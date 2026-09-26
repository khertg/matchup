import { describe, expect, it } from 'vitest'
import { requiresDeviceName, requiresLogin } from './gate'

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

describe('requiresDeviceName', () => {
  const signedIn = { cloudConfigured: true, signedIn: true, isViewerPath: false, clubSlug: 'downtown', online: true }

  it('asks a signed-in device with no name for a name', () => {
    expect(requiresDeviceName({ ...signedIn, namedFor: null })).toBe(true)
  })

  it('lets a device named for this club straight in', () => {
    expect(requiresDeviceName({ ...signedIn, namedFor: 'downtown' })).toBe(false)
  })

  it('asks again when another club logs in on the device', () => {
    expect(requiresDeviceName({ ...signedIn, clubSlug: 'uptown', namedFor: 'downtown' })).toBe(true)
  })

  it('lets an unnamed device carry on offline, since the name has to be checked with the club', () => {
    expect(requiresDeviceName({ ...signedIn, namedFor: null, online: false })).toBe(false)
  })

  it('never asks before login, on the public live page, or in a build with no cloud', () => {
    expect(requiresDeviceName({ ...signedIn, signedIn: false, clubSlug: null, namedFor: null })).toBe(false)
    expect(requiresDeviceName({ ...signedIn, isViewerPath: true, namedFor: null })).toBe(false)
    expect(requiresDeviceName({ ...signedIn, cloudConfigured: false, namedFor: null })).toBe(false)
  })
})
