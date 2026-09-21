import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'tsup'

// The release number lives in the root package.json (one place to bump). The commit comes from
// GIT_SHA when git is not available, as in a Docker build.
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

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  clean: true,
  sourcemap: true,
  define: {
    __API_VERSION__: JSON.stringify(rootPackage.version),
    __API_COMMIT__: JSON.stringify(gitCommit()),
  },
  // Inline the workspace package; keep real dependencies external so they come from node_modules.
  noExternal: [/^@matchup\//],
  external: ['@electric-sql/pglite'],
})
