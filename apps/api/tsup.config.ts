import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  clean: true,
  sourcemap: true,
  // Inline the workspace package; keep real dependencies external so they come from node_modules.
  noExternal: [/^@matchup\//],
  external: ['@electric-sql/pglite'],
})
