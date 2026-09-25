import { describe, expect, it } from 'vitest'
import { CARD_PRESETS, cardColors, darken, luminance } from './cardPalette'

describe('cardColors', () => {
  it('uses white text on every preset', () => {
    for (const preset of CARD_PRESETS) {
      const colors = cardColors({ preset: preset.id })
      expect(colors.text).toBe('#ffffff')
      expect(colors.background).toContain(preset.from)
      expect(colors.background).toContain(preset.to)
    }
  })

  it('keeps white text on a dark custom colour and switches to dark text on a light one', () => {
    expect(cardColors({ custom: '#123456' }).text).toBe('#ffffff')
    const light = cardColors({ custom: '#fde047' })
    expect(light.text).toBe('#0f172a')
    expect(light.lightText).toBe(false)
  })

  it('fades a custom colour in from a darker shade of itself', () => {
    const colors = cardColors({ custom: '#FDE047' })
    const [from, to] = colors.background.match(/#[0-9a-f]{6}/g)!
    expect(to).toBe('#fde047')
    expect(luminance(from)).toBeLessThan(luminance(to))
  })

  it('falls back to Court for an unknown preset or a bad colour', () => {
    const court = cardColors({ preset: 'court' })
    expect(cardColors({ preset: 'nope' })).toEqual(court)
    expect(cardColors({ custom: 'red' })).toEqual(court)
  })
})

describe('darken', () => {
  it('mixes with black', () => {
    expect(darken('#ffffff', 0.5)).toBe('#808080')
    expect(darken('#ff0000', 1)).toBe('#000000')
  })
})
