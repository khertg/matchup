import { describe, expect, it } from 'vitest'
import { canonicalLiveBoardPath, viewerUrl } from './url'

describe('viewerUrl', () => {
  it('ends with /live', () => {
    expect(viewerUrl('downtown', 'https://q2dink.example')).toBe('https://q2dink.example/club/downtown/live')
  })
})

describe('canonicalLiveBoardPath', () => {
  it('moves the older address and a trailing slash to /club/<name>/live', () => {
    expect(canonicalLiveBoardPath('/club/downtown')).toBe('/club/downtown/live')
    expect(canonicalLiveBoardPath('/club/downtown/')).toBe('/club/downtown/live')
    expect(canonicalLiveBoardPath('/club/downtown/live/')).toBe('/club/downtown/live')
  })

  it('leaves the canonical address and every other path alone', () => {
    for (const path of ['/club/downtown/live', '/', '/club', '/club/UP', '/club/a/b']) {
      expect(canonicalLiveBoardPath(path), path).toBeNull()
    }
  })
})
