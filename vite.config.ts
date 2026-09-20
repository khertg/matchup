import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
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
  server: {
    // Bind-mounted files on Windows/macOS don't emit fs events; poll inside Docker.
    watch: process.env.USE_POLLING ? { usePolling: true } : undefined,
  },
  test: {
    environment: 'node',
  },
})
