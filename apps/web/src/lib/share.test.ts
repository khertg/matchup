import { afterEach, describe, expect, it, vi } from 'vitest'
import { canShareNatively, shareImages } from './share'

const fakeFile = (name = 'test.png') => new File(['x'], name, { type: 'image/png' })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shareImages', () => {
  it('shares the files through the native sheet when the device can take files', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { canShare: () => true, share })
    const files = [fakeFile('a.png'), fakeFile('b.png')]

    const result = await shareImages({ files, title: 'Q2Dink standings', text: 'Standings' })

    expect(result).toBe('shared')
    expect(share).toHaveBeenCalledWith({ files, title: 'Q2Dink standings', text: 'Standings' })
  })

  it('shares a link through the native sheet when files are not supported but a url is given', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { canShare: () => false, share })

    const result = await shareImages({ files: [fakeFile()], title: 'T', url: 'https://example.com' })

    expect(result).toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'T', text: undefined, url: 'https://example.com' })
  })

  it('downloads every file when the device has no share support at all', async () => {
    vi.stubGlobal('navigator', {})
    const anchor = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) })
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })
    const files = [fakeFile('a.png'), fakeFile('b.png')]

    const result = await shareImages({ files, title: 'T' })

    expect(result).toBe('downloaded')
    expect(anchor.click).toHaveBeenCalledTimes(2)
  })

  it('downloads when share() exists but there is nothing to share it with (no file support, no url)', async () => {
    vi.stubGlobal('navigator', { share: vi.fn() })
    const anchor = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) })
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })

    const result = await shareImages({ files: [fakeFile()], title: 'T' })

    expect(result).toBe('downloaded')
    expect(anchor.click).toHaveBeenCalledTimes(1)
  })

  it('reports "cancelled", not an error, when the person dismisses the share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError'))
    vi.stubGlobal('navigator', { canShare: () => true, share })

    const result = await shareImages({ files: [fakeFile()], title: 'T' })

    expect(result).toBe('cancelled')
  })

  it('falls back to downloading when the file share fails for a reason other than cancelling', async () => {
    const share = vi.fn().mockRejectedValue(new Error('boom'))
    vi.stubGlobal('navigator', { canShare: () => true, share })
    const anchor = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) })
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })

    const result = await shareImages({ files: [fakeFile()], title: 'T' })

    expect(result).toBe('downloaded')
    expect(anchor.click).toHaveBeenCalledTimes(1)
  })

  it('falls back to downloading when the file share fails and the link share also fails', async () => {
    const share = vi.fn().mockRejectedValue(new Error('boom'))
    vi.stubGlobal('navigator', { canShare: () => true, share })
    const anchor = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) })
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })

    const result = await shareImages({ files: [fakeFile()], title: 'T', url: 'https://example.com' })

    expect(result).toBe('downloaded')
    expect(share).toHaveBeenCalledTimes(2) // tried the files, then the link
    expect(anchor.click).toHaveBeenCalledTimes(1)
  })
})

describe('canShareNatively', () => {
  it('reflects whether the device exposes navigator.share', () => {
    vi.stubGlobal('navigator', { share: vi.fn() })
    expect(canShareNatively()).toBe(true)

    vi.stubGlobal('navigator', {})
    expect(canShareNatively()).toBe(false)
  })
})
