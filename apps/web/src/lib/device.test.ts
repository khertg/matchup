import { describe, expect, it } from 'vitest'
import { deviceDisplay, deviceLabel, shortDeviceId } from './device'

const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  samsungInternet:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  iPhone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iPad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:130.0) Gecko/20100101 Firefox/130.0',
}

describe('deviceLabel', () => {
  it('names an Android phone by the model code Chrome gives through client hints', () => {
    expect(deviceLabel(UA.androidChrome, { model: 'SM-S918B', platform: 'Android', platformVersion: '14.0.0' })).toBe(
      'SM-S918B · Android 14 · Chrome',
    )
  })

  it('falls back to the model in the user agent, and leaves out Chrome’s "K" placeholder', () => {
    expect(deviceLabel(UA.samsungInternet)).toBe('SM-S918B · Android 14 · Samsung Internet')
    expect(deviceLabel(UA.androidChrome)).toBe('Android 10 · Chrome')
  })

  it('says only iPhone or iPad for Apple devices: two iPhone 16s look the same', () => {
    expect(deviceLabel(UA.iPhone)).toBe('iPhone · iOS 18 · Safari')
    expect(deviceLabel(UA.iPad)).toBe('iPad · iOS 17 · Safari')
  })

  it('trusts an iOS user agent over client hints, which Apple devices never send', () => {
    expect(deviceLabel(UA.iPhone, { model: '', platform: 'Windows', platformVersion: '15.0.0' })).toBe('iPhone · iOS 18 · Safari')
  })

  it('gives the system and browser of a computer', () => {
    expect(deviceLabel(UA.windowsEdge, { platform: 'Windows', platformVersion: '15.0.0' })).toBe('Windows · Edge')
    expect(deviceLabel(UA.macFirefox)).toBe('Mac · Firefox')
  })

  it('says something even for a device it does not know', () => {
    expect(deviceLabel('')).toBe('Unknown device')
  })
})

describe('deviceDisplay', () => {
  const id = '3f2a91c7-0000-4000-8000-000000000000'

  it('puts the name first, with the details and the short id underneath', () => {
    expect(deviceDisplay({ id, label: 'iPhone · iOS 18 · Safari', name: 'Desk' })).toEqual({
      title: 'Desk',
      detail: 'iPhone · iOS 18 · Safari #3f2a',
    })
  })

  it('shows the details and short id of a device not named yet', () => {
    expect(deviceDisplay({ id, label: 'iPhone · iOS 18 · Safari' })).toEqual({ title: 'iPhone · iOS 18 · Safari', detail: '#3f2a' })
    expect(shortDeviceId('ab-cd-ef')).toBe('#abcd')
  })
})
