import type amqplib from 'amqplib'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import { processTokenMessage } from '../token/processor.js'
import { captureError } from '../../config/sentry.js'

const MAX_RETRY_COUNT = 3
const RETRY_DELAY_MS = 2000

function parseMessage(msg: amqplib.Message): unknown {
  const content = msg.content.toString('utf-8')
  try {
    return JSON.parse(content) as unknown
  } catch {
    throw new Error(`Non-JSON RabbitMQ message received: ${content.slice(0, 200)}`)
  }
}

function getRetryCount(msg: amqplib.Message): number {
  const headers = msg.properties.headers as Record<string, unknown> | undefined
  const xDeath = headers?.['x-death']
  if (!Array.isArray(xDeath) || xDeath.length === 0) return 0
  const count = (xDeath[0] as { count?: unknown }).count
  return typeof count === 'number' ? count : 0
}

async function withRetryDelay(attempt: number): Promise<void> {
  const delay = RETRY_DELAY_MS * Math.pow(2, attempt) // exponential backoff
  await new Promise((resolve) => setTimeout(resolve, delay))
}

export async function startConsumer(channel: amqplib.Channel): Promise<void> {
  logger.info('Starting RabbitMQ consumer', { queue: env.RABBITMQ_QUEUE })

  await channel.consume(env.RABBITMQ_QUEUE, async (msg) => {
    if (!msg) return // null message = consumer cancelled

    const retryCount = getRetryCount(msg)

    try {
      const payload = parseMessage(msg)
      const result = await processTokenMessage(payload)

      logger.info('Message processed successfully', {
        contractAddress: result.contractAddress,
        txHash: result.transactionHash,
        type: result.type,
        network: result.network,
      })

      channel.ack(msg)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to process message', { error: errorMessage, retryCount })
      captureError(error, { retryCount })

      if (retryCount < MAX_RETRY_COUNT) {
        // Nack with requeue=false → goes to DLX → re-queued with backoff
        await withRetryDelay(retryCount)
        channel.nack(msg, false, false)
        logger.warn('Message nacked for retry', { retryCount: retryCount + 1 })
      } else {
        // Exhausted retries → discard to dead-letter queue
        logger.error('Message exhausted retries, sending to dead-letter queue', { retryCount })
        channel.nack(msg, false, false)
      }
    }
  })

  logger.info('Consumer started, waiting for messages')
}
