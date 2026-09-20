import { Medal as MedalIcon } from 'lucide-react'
import type { Medal } from '@/rotation/standings'

const STYLES: Record<Medal, { label: string; className: string }> = {
  gold: { label: 'Gold', className: 'text-amber-500' },
  silver: { label: 'Silver', className: 'text-slate-400' },
  bronze: { label: 'Bronze', className: 'text-orange-700' },
}

export function MedalBadge({ medal }: { medal: Medal | null }) {
  if (!medal) return null
  const { label, className } = STYLES[medal]
  return (
    <span className="inline-flex items-center" title={`${label} medal`}>
      <MedalIcon className={`size-4 ${className}`} aria-hidden />
      <span className="sr-only">{label} medal</span>
    </span>
  )
}
