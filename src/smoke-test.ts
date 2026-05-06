/**
 * Smoke test — runs an end-to-end token deployment on startup.
 *
 * Flow:
 *   1. Publishes a ERC-20 test message to token_creation_request queue
 *   2. The creation consumer picks it up, deploys via DFNS and publishes result
 *   3. This module waits on the result exchanges (success or error)
 *   4. Resolves on success, throws on error or timeout
 */
import type amqplib from 'amqplib'
import { randomUUID } from 'crypto'
import { env } from './config/env.js'
import { logger } from './utils/logger.js'

// DFNS + block confirmation can take a few minutes
const TIMEOUT_MS = 5 * 60 * 1000

export async function runSmokeTest(channel: amqplib.Channel): Promise<void> {
  if (!env.TEST_OWNER_ADDRESS) {
    throw new Error('Smoke test requires TEST_OWNER_ADDRESS to be set in .env')
  }

  const idempotencyKey = `smoke-${randomUUID()}`
  const correlationId = randomUUID()

  const message = {
    event: 'token.creation.requested',
    idempotencyKey,
    timestamp: new Date().toISOString(),
    network: { name: 'ethereum', chainId: 11155111 },
    token: {
      standard: 'ERC20',
      name: 'Smoke Test Token',
      symbol: 'SMK',
      ownerAddress: env.TEST_OWNER_ADDRESS,
    },
    params: {
      erc20: { decimals: 18, supply: 1 },
    },
    metadata: {
      requester: 'smoke-test',
      correlationId,
    },
  }

  // Bind exclusive auto-delete queues to both result exchanges
  const successQ = await channel.assertQueue('', { exclusive: true, autoDelete: true })
  await channel.bindQueue(successQ.queue, env.RABBITMQ_CREATED_EXCHANGE, '#')

  const errorQ = await channel.assertQueue('', { exclusive: true, autoDelete: true })
  await channel.bindQueue(errorQ.queue, env.RABBITMQ_ERROR_EXCHANGE, '#')

  logger.info('Smoke test: publishing test message', { idempotencyKey, correlationId })

  channel.sendToQueue(
    env.RABBITMQ_CREATION_QUEUE,
    Buffer.from(JSON.stringify(message)),
    { persistent: true, contentType: 'application/json' },
  )

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Smoke test timed out after ${TIMEOUT_MS / 1000}s waiting for deployment result`))
    }, TIMEOUT_MS)

    const done = (err?: Error): void => {
      clearTimeout(timeout)
      if (err) reject(err)
      else resolve()
    }

    void channel.consume(successQ.queue, (msg) => {
      if (!msg) return
      try {
        const event = JSON.parse(msg.content.toString('utf-8')) as Record<string, unknown>
        if (event['idempotencyKey'] !== idempotencyKey) return
        channel.ack(msg)
        const deployment = event['deployment'] as Record<string, unknown> | undefined
        const explorer = event['explorer'] as Record<string, unknown> | undefined
        logger.info('Smoke test passed', {
          contractAddress: deployment?.['contractAddress'],
          txHash: deployment?.['transactionHash'],
          explorerContractUrl: explorer?.['contractUrl'],
        })
        done()
      } catch (err) {
        done(err instanceof Error ? err : new Error(String(err)))
      }
    }, { noAck: false })

    void channel.consume(errorQ.queue, (msg) => {
      if (!msg) return
      try {
        const event = JSON.parse(msg.content.toString('utf-8')) as Record<string, unknown>
        if (event['idempotencyKey'] !== idempotencyKey) return
        channel.ack(msg)
        const error = event['error'] as Record<string, unknown> | undefined
        done(new Error(`Smoke test failed: [${String(error?.['code'])}] ${String(error?.['message'])}`))
      } catch (err) {
        done(err instanceof Error ? err : new Error(String(err)))
      }
    }, { noAck: false })
  })
}
