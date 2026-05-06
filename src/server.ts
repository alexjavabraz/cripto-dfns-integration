import { initSentry, captureError } from './config/sentry.js'
import { env } from './config/env.js'
import { logger } from './utils/logger.js'
import { buildApp } from './app.js'
import { connect, disconnect } from './modules/rabbitmq/connection.js'
import { startConsumer } from './modules/rabbitmq/consumer.js'
import { startCreationConsumer } from './modules/rabbitmq/creation-consumer.js'
import { runSmokeTest } from './smoke-test.js'
import { startBalanceConsumer } from './modules/rabbitmq/balance-consumer.js'
import { startTokenEventConsumer } from './modules/rabbitmq/token-event-consumer.js'

// Initialize Sentry first — before anything else can throw
initSentry()

async function main(): Promise<void> {
  logger.info('Starting dfns_integration service', { nodeEnv: env.NODE_ENV })

  // --- Start Fastify (health check) ---
  const app = await buildApp()
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  logger.info(`HTTP server listening on port ${env.PORT}`)

  // --- Connect to RabbitMQ and start consuming ---
  const channel = await connect()

  // Creation consumer must start before smoke test so it can process the test message
  await startCreationConsumer(channel)

  // --- Optional smoke test ---
  if (env.SMOKE_TEST) {
    logger.info('Smoke test enabled — running end-to-end deployment test before accepting traffic')
    try {
      await runSmokeTest(channel)
      logger.info('Smoke test completed successfully — starting service')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error('Smoke test failed — aborting startup', { error: msg })
      captureError(error, { context: 'smoke-test' })
      process.exit(1)
    }
  }

  await startConsumer(channel)
  await startBalanceConsumer(channel)
  await startTokenEventConsumer(channel)

  // --- Graceful shutdown ---
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully`)
    try {
      await app.close()
      await disconnect()
      logger.info('Graceful shutdown complete')
      process.exit(0)
    } catch (error) {
      captureError(error, { context: 'shutdown' })
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      })
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack })
    captureError(error, { context: 'uncaughtException' })
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    logger.error('Unhandled promise rejection', { error: error.message })
    captureError(error, { context: 'unhandledRejection' })
    process.exit(1)
  })
}

main().catch((error: unknown) => {
  captureError(error, { context: 'startup' })
  logger.error('Fatal startup error', {
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})
