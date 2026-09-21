import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:4173'
const cloudURL = 'http://localhost:4174'
const apiURL = 'http://127.0.0.1:8788'

// Tests run against production builds (vite preview) because the PWA service
// worker only exists in built output.
//  - Port 4173: the normal build with no API configured (cloud UI hidden).
//  - Port 4174: a `cloudtest` build that talks to a REAL API on port 8788
//    (embedded Postgres, in memory, started fresh for each run). Its tests live
//    in e2e/cloud, and every club they create has a unique name.
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
      // A developer's own .env.local must not switch cloud features on for these tests.
      env: { VITE_API_URL: '' },
    },
    {
      command: 'npm run build:cloudtest && npm run preview:cloudtest',
      url: cloudURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { API_PROXY_TARGET: apiURL },
    },
    {
      // The real API, with limits raised so many tests can share one address.
      command: 'npm run start:test -w @q2dink/api',
      cwd: '../..',
      url: `${apiURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATABASE_URL: 'pglite://memory',
        HOST: '127.0.0.1',
        PORT: '8788',
        LOG_LEVEL: 'warn',
        RATE_LIMIT_MAX: '1000000',
        RATE_LIMIT_AUTH_MAX: '1000000',
        RATE_LIMIT_WRITE_MAX: '1000000',
        LOGIN_MAX_FAILURES_PER_IP: '100000',
        LOGIN_MAX_FAILURES_PER_CLUB: '100000',
        MAX_SUBSCRIBERS_PER_IP: '1000',
      },
    },
  ],
})
