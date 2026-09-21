export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/** The colour of the browser's address bar and the installed app's title bar in each theme. */
export const THEME_COLORS = { light: '#16a34a', dark: '#0a0a0a' } as const

/** Whether a saved choice (or none) means dark right now, given the device's own setting. */
export function isDark(saved: string | null | undefined, systemDark: boolean): boolean {
  if (saved === 'dark') return true
  if (saved === 'light') return false
  return systemDark
}

export const isThemeChoice = (value: string | undefined): value is ThemeChoice =>
  value === 'light' || value === 'dark' || value === 'system'
