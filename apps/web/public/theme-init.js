// Runs before the app draws anything, so a dark-mode user never sees a white flash.
// It has to be an external file: the Content-Security-Policy does not allow inline scripts.
// Keep it in step with isDark() in src/lib/theme.ts (a test runs this file against the same cases).
// The choice is stored by next-themes under the key "theme": "light", "dark" or "system".
try {
  var saved = localStorage.getItem('theme')
  var dark = saved === 'dark' || (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  var root = document.documentElement
  if (dark) root.classList.add('dark')
  else root.classList.remove('dark')
  root.style.colorScheme = dark ? 'dark' : 'light'
} catch {
  // Storage blocked or no matchMedia: the app sets the theme itself once it starts.
}
