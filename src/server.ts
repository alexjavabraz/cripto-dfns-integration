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
  let channel
  try {
    channel = await connect()
  } catch (error) {
    captureError(error, { context: 'startup:rabbitmq-connect', url: env.RABBITMQ_URL.replace(/:[^:@]+@/, ':***@') })
    throw error
  }

  // Creation consumer must start before smoke test so it can process the test message
  try {
    await startCreationConsumer(channel)
  } catch (error) {
    captureError(error, { context: 'startup:creation-consumer', queue: env.QUEUE_REQUEST_TOKEN_CREATION })
    throw error
  }

  // --- Optional smoke test ---
  if (env.SMOKE_TEST) {
    logger.info('Smoke test enabled — running end-to-end deployment test before accepting traffic')
    try {
      await runSmokeTest(channel)
      logger.info('Smoke test completed successfully — starting service')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error('Smoke test failed — aborting startup', { error: msg })
      captureError(error, { context: 'startup:smoke-test' })
      process.exit(1)
    }
  }

  try {
    await startConsumer(channel)
  } catch (error) {
    captureError(error, { context: 'startup:consumer', queue: env.RABBITMQ_QUEUE })
    throw error
  }

  try {
    await startBalanceConsumer(channel)
  } catch (error) {
    captureError(error, { context: 'startup:balance-consumer', queue: env.QUEUE_GET_BALANCE })
    throw error
  }

  try {
    await startTokenEventConsumer(channel)
  } catch (error) {
    captureError(error, { context: 'startup:token-event-consumer', exchange: env.TOKEN_EVENT })
    throw error
  }

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
