import { describe, expect, it } from 'vitest'
import { courtColumns } from './courtColumns'

describe('courtColumns', () => {
  it('balances the rows where three courts fit side by side', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9, 10].map((n) => courtColumns(n, 3))).toEqual([1, 2, 3, 2, 3, 3, 3, 3, 3])
  })

  it('never uses more columns than fit', () => {
    expect([1, 2, 3, 5].map((n) => courtColumns(n, 2))).toEqual([1, 2, 2, 2])
    expect([1, 4, 15].map((n) => courtColumns(n, 1))).toEqual([1, 1, 1])
    expect(courtColumns(0, 3)).toBe(1)
  })
})
