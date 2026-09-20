import { buildApp } from './app'
import { loadConfig } from './config'
import { connectDb } from './db'
import { migrate } from './db/migrate'

async function main() {
  const config = loadConfig()
  const db = await connectDb(config.databaseUrl)

  const app = await buildApp({ db, config })
  const applied = await migrate(db, undefined, (message) => app.log.info(message))
  if (applied.length === 0) app.log.info('database schema is up to date')

  await app.listen({ host: config.host, port: config.port })

  let stopping = false
  const stop = async (signal: string) => {
    if (stopping) return
    stopping = true
    app.log.info(`${signal} received, shutting down`)
    try {
      await app.close()
      await db.close()
      process.exit(0)
    } catch (error) {
      app.log.error(error, 'error during shutdown')
      process.exit(1)
    }
  }
  process.on('SIGTERM', () => void stop('SIGTERM'))
  process.on('SIGINT', () => void stop('SIGINT'))
}

main().catch((error) => {
  // Configuration and database errors land here with a readable message.
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
