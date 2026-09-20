// Runs supabase/migrations and supabase/tests against a throwaway Postgres in Docker.
// Usage: npm run test:db   (needs Docker running)
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const NAME = 'matchup-dbtest'
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const docker = (args, options = {}) => spawnSync('docker', args, { encoding: 'utf8', ...options })

function psql(file) {
  const result = docker(
    ['exec', '-i', NAME, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
    { input: readFileSync(file), stdio: ['pipe', 'inherit', 'inherit'] },
  )
  return result.status === 0
}

function sqlFiles(dir) {
  return readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(ROOT, dir, f))
}

function cleanup() {
  docker(['rm', '-f', NAME])
}

cleanup()
const started = docker(['run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=pg', 'postgres:16-alpine'])
if (started.status !== 0) {
  console.error(started.stderr || 'Could not start Postgres. Is Docker running?')
  process.exit(1)
}

// The image restarts Postgres once during first boot, so require two good pings in a row.
let ready = 0
for (let i = 0; i < 60 && ready < 2; i++) {
  const ping = docker(['exec', NAME, 'psql', '-U', 'postgres', '-tAc', 'select 1'])
  ready = ping.status === 0 ? ready + 1 : 0
  if (ready < 2) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{}, 1000)'])
}
if (ready < 2) {
  console.error('Postgres did not become ready in time')
  cleanup()
  process.exit(1)
}

// Stubs first (they stand in for Supabase), then the migration, then the checks.
const files = [
  join(ROOT, 'supabase/tests/00_stubs.sql'),
  ...sqlFiles('supabase/migrations'),
  ...sqlFiles('supabase/tests').filter((f) => !f.endsWith('00_stubs.sql')),
]
let ok = true
for (const file of files) {
  console.log(`> ${file.slice(ROOT.length)}`)
  if (!psql(file)) {
    ok = false
    break
  }
}

cleanup()
console.log(ok ? '\nDatabase tests passed.' : '\nDatabase tests FAILED.')
process.exit(ok ? 0 : 1)
