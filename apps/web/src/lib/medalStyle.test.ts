import { describe, expect, it } from 'vitest'
import { medalRowBackground, medalStyle } from './medalStyle'

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('medalStyle', () => {
  it('gives gold, silver and bronze their own label and colour', () => {
    const styles = (['gold', 'silver', 'bronze'] as const).map(medalStyle)
    expect(styles.map((s) => s?.label)).toEqual(['Gold', 'Silver', 'Bronze'])
    expect(new Set(styles.map((s) => s?.color)).size).toBe(3)
  })

  it('writes each medal’s pill in text that is easy to read on it', () => {
    for (const medal of ['gold', 'silver', 'bronze'] as const) {
      const style = medalStyle(medal)!
      expect(contrast(style.ink, style.color)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('picks out nobody without a medal', () => {
    expect(medalStyle(null)).toBeNull()
  })
})

describe('medalRowBackground', () => {
  it('lays the medal’s wash over the row’s usual colour', () => {
    const gold = medalStyle('gold')!
    expect(medalRowBackground(gold, 'rgba(0, 0, 0, 0.2)')).toBe(
      `linear-gradient(${gold.tint}, ${gold.tint}), rgba(0, 0, 0, 0.2)`,
    )
  })
})
