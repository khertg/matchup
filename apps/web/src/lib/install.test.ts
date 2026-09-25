import { afterEach, describe, expect, it, vi } from 'vitest'
import { isIos } from './install'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

describe('isIos', () => {
  it('knows iPhones, and iPads that call themselves a Mac with a touch screen', () => {
    expect(isIos(IPHONE, 5)).toBe(true)
    expect(isIos(MAC, 5)).toBe(true)
  })

  it('leaves out real Macs, Android and Windows', () => {
    expect(isIos(MAC, 0)).toBe(false)
    expect(isIos(ANDROID, 5)).toBe(false)
    expect(isIos(WINDOWS, 0)).toBe(false)
  })
})

describe('dismissing the banner', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('is remembered for the next launch', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    const first = await import('./install')
    expect(first.useInstall.getState().dismissed).toBe(false)
    first.useInstall.getState().dismiss()
    expect(first.useInstall.getState().dismissed).toBe(true)

    vi.resetModules()
    const next = await import('./install')
    expect(next.useInstall.getState().dismissed).toBe(true)
  })

  it('still works when storage refuses', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const { useInstall } = await import('./install')
    expect(useInstall.getState().dismissed).toBe(false)
    useInstall.getState().dismiss()
    expect(useInstall.getState().dismissed).toBe(true)
  })
})
