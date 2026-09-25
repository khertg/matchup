// First, so the saved session and login of a device that used the app under its old name are moved to the
// new keys before the stores read them.
import './legacy'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import './index.css'
import App from './App.tsx'
import { showCanonicalLiveBoardAddress } from './cloud/url'
import { listenForInstall } from './lib/install'

// Before rendering: the browser can offer installation before React has mounted.
listenForInstall()
// Before rendering too: printed QR codes open /club/<name>; the address bar then shows /club/<name>/live.
showCanonicalLiveBoardAddress()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
