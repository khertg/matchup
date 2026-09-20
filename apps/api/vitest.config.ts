import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Tests share one database when run against real Postgres, so they must not overlap.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
})
