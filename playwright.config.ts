import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:4173'
const cloudURL = 'http://localhost:4174'

// Tests run against production builds (vite preview) because the PWA service
// worker only exists in built output.
//  - Port 4173: the normal build with no cloud credentials (cloud UI hidden).
//  - Port 4174: a `cloudtest` build with fake Supabase credentials. Its tests
//    (e2e/cloud) intercept every Supabase request, so no real project is needed.
const isCloudTest = /[\\/]cloud[\\/].*\.spec\.ts$/

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', testIgnore: isCloudTest, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testIgnore: isCloudTest, use: { ...devices['Pixel 7'] } },
    {
      name: 'cloud',
      testMatch: isCloudTest,
      use: { ...devices['Desktop Chrome'], baseURL: cloudURL, serviceWorkers: 'block' },
    },
    {
      name: 'cloud-mobile',
      testMatch: isCloudTest,
      use: { ...devices['Pixel 7'], baseURL: cloudURL, serviceWorkers: 'block' },
    },
  ],
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run build:cloudtest && npm run preview:cloudtest',
      url: cloudURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
