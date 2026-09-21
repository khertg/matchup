import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { configDefaults, defineConfig } from 'vitest/config'

// The dev and preview servers forward /api to the API, so the browser sees a single origin
// (exactly as it will behind the reverse proxy in production) and needs no CORS setup.
const apiProxy = {
  '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:8787' },
}

// The build this is: the release number from the root package.json (one place to bump), the short git
// commit (GIT_SHA when git is not available, as in a Docker build) and today's date.
const rootPackage = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../package.json'), 'utf8')) as { version: string }

function gitCommit(): string {
  const fromEnv = process.env.GIT_SHA?.trim()
  if (fromEnv) return fromEnv.slice(0, 7)
  try {
    const out = execSync('git rev-parse --short HEAD', { cwd: import.meta.dirname, stdio: ['ignore', 'pipe', 'ignore'] })
    return out.toString().trim() || 'dev'
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version),
    __APP_COMMIT__: JSON.stringify(gitCommit()),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Matchup',
        short_name: 'Matchup',
        description: 'Pickleball open play manager and court rotation tool',
        theme_color: '#16a34a',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    proxy: apiProxy,
    // Bind-mounted files on Windows/macOS don't emit fs events; poll inside Docker.
    watch: process.env.USE_POLLING ? { usePolling: true } : undefined,
  },
  // `vite preview` serves the built app the same way, so E2E runs see the same /api.
  preview: { proxy: apiProxy },
  test: {
    environment: 'node',
    // Playwright specs live in e2e/ and must not be picked up by Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
