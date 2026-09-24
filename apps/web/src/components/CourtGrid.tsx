import { Children, isValidElement, type ReactNode } from 'react'
import { courtColumns } from '@/lib/courtColumns'

// Fixed class names (Tailwind only sees whole strings). With gap-3 (0.75rem), n columns each take
// (100% - (n - 1) × 0.75rem) / n.
const SM_BASIS: Record<number, string> = { 1: 'sm:basis-full', 2: 'sm:basis-[calc(50%-0.375rem)]' }
const LG_BASIS: Record<number, string> = {
  1: 'lg:basis-full',
  2: 'lg:basis-[calc(50%-0.375rem)]',
  3: 'lg:basis-[calc(33.333%-0.5rem)]',
}

/**
 * The courts across the whole width: one per row on a phone, up to two on a tablet and three on a
 * laptop, in balanced rows. Every court is the same size; a shorter last row (five courts: three, then
 * two) keeps that size and sits centred under the full rows.
 */
export function CourtGrid({ children }: { children: ReactNode }) {
  const items = Children.toArray(children)
  const basis = `basis-full ${SM_BASIS[courtColumns(items.length, 2)]} ${LG_BASIS[courtColumns(items.length, 3)]}`
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {items.map((child, i) => (
        // Keyed by the court's own key, so moving a court keeps its card (and anything open in it).
        <div key={isValidElement(child) && child.key !== null ? child.key : i} className={`min-w-0 ${basis}`}>
          {child}
        </div>
      ))}
    </div>
  )
}
