import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isThemeChoice, THEME_CHOICES, THEME_COLORS, type ThemeChoice } from '@/lib/theme'

const ICONS = { light: SunIcon, dark: MoonIcon, system: MonitorIcon } as const

/** Keep the browser's address bar / installed app title bar in step with the theme. */
function useThemeColorMeta(resolved: string | undefined) {
  useEffect(() => {
    const color = resolved === 'dark' ? THEME_COLORS.dark : THEME_COLORS.light
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  }, [resolved])
}

/**
 * Light, Dark or System (follow the phone or computer). Remembered on the device by next-themes and
 * shown on every screen, including the login screen and the players' live page.
 */
export function ThemeSwitch() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  useThemeColorMeta(resolvedTheme)
  const choice: ThemeChoice = isThemeChoice(theme) ? theme : 'system'
  const Icon = ICONS[choice]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Colour theme"
          title={`Colour theme: ${THEME_CHOICES.find((c) => c.value === choice)?.label}`}
        >
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Colour theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={choice} onValueChange={(value) => isThemeChoice(value) && setTheme(value)}>
          {THEME_CHOICES.map(({ value, label }) => {
            const ItemIcon = ICONS[value]
            return (
              <DropdownMenuRadioItem key={value} value={value}>
                <ItemIcon aria-hidden="true" />
                {label}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
