import type amqplib from 'amqplib'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import { captureError, captureMessage, Sentry } from '../../config/sentry.js'
import { tokenEventSchema, type TokenEventResponse, type TokenEventErrorResponse } from '../../schemas/token-event.schema.js'
import { executeTokenOperation } from '../token/token-ops.js'
import { getNetworkConfig } from '../token/networks.js'

const PROCESSED_BY = 'dfns-integration'

function publishResponse(
  channel: amqplib.Channel,
  event: TokenEventResponse | TokenEventErrorResponse,
): void {
  const routingKey = event.event === 'token.event.succeeded'
    ? 'token.event.succeeded'
    : 'token.event.failed'
  channel.publish(
    env.EXCHANGE_TOKEN_EVENT_RESPONSE,
    routingKey,
    Buffer.from(JSON.stringify(event)),
    { persistent: true, contentType: 'application/json' },
  )
}

export async function startTokenEventConsumer(channel: amqplib.Channel): Promise<void> {
  logger.info('Starting token event consumer', {
    exchange: env.TOKEN_EVENT,
    queue: env.QUEUE_TOKEN_EVENT,
  })

  await channel.consume(env.QUEUE_TOKEN_EVENT, async (msg) => {
    if (!msg) return

    const startMs = Date.now()
    let rawPayload: unknown

    // Parse JSON
    try {
      rawPayload = JSON.parse(msg.content.toString('utf-8')) as unknown
      Sentry.addBreadcrumb({
        category: 'rabbitmq.receive',
        message: `Message received from queue ${env.QUEUE_TOKEN_EVENT}`,
        data: rawPayload as Record<string, unknown>,
        level: 'info',
      })
    } catch (err) {
      logger.error('Failed to parse token event message', {
        error: err instanceof Error ? err.message : String(err),
      })
      captureError(err, { context: 'token-event-consumer:parse' })
      channel.ack(msg)
      return
    }

    // Validate schema
    const parsed = tokenEventSchema.safeParse(rawPayload)
    if (!parsed.success) {
      const issues = parsed.error.flatten()
      const idempotencyKey = (rawPayload as Record<string, unknown>)?.['idempotencyKey'] as string ?? 'unknown'
      logger.error('Invalid token event message', { issues, idempotencyKey })
      const validationError = new Error(`Invalid token event: ${JSON.stringify(issues.fieldErrors)}`)
      captureError(validationError, { context: 'token-event-consumer:validation', idempotencyKey, issues })

      const raw = rawPayload as Record<string, unknown>
      const errorEvent: TokenEventErrorResponse = {
        event: 'token.event.failed',
        idempotencyKey,
        timestamp: new Date().toISOString(),
        network: { name: 'unknown', chainId: 0 },
        token: { address: String(raw?.['token'] ?? ''), standard: 'ERC20' },
        operation: { type: String((raw?.['operation'] as Record<string, unknown>)?.['type'] ?? 'unknown') },
        error: { code: 'VALIDATION_ERROR', message: validationError.message },
        metadata: {
          correlationId: String((raw?.['metadata'] as Record<string, unknown>)?.['correlationId'] ?? 'unknown'),
          processedBy: PROCESSED_BY,
          durationMs: Date.now() - startMs,
        },
      }
      publishResponse(channel, errorEvent)
      channel.ack(msg)
      return
    }

    const event = parsed.data
    const { idempotencyKey, network, token, operation, metadata } = event

    logger.info('Processing token event', {
      idempotencyKey,
      correlationId: metadata.correlationId,
      network: network.name,
      tokenAddress: token.address,
      standard: token.standard,
      operation: operation.type,
    })

    try {
      const result = await executeTokenOperation(event)
      const { explorerUrl } = getNetworkConfig(network.name)

      const response: TokenEventResponse = {
        event: 'token.event.succeeded',
        idempotencyKey,
        timestamp: new Date().toISOString(),
        network,
        token: { address: token.address, standard: token.standard },
        operation: { type: operation.type },
        result,
        explorer: { transactionUrl: `${explorerUrl}/tx/${result.txHash}` },
        metadata: {
          correlationId: metadata.correlationId,
          processedBy: PROCESSED_BY,
          durationMs: Date.now() - startMs,
        },
      }

      publishResponse(channel, response)
      captureMessage('RabbitMQ message processed: token event succeeded', 'info', {
        queue: env.QUEUE_TOKEN_EVENT,
        idempotencyKey,
        correlationId: metadata.correlationId,
        network: network.name,
        tokenAddress: token.address,
        operation: operation.type,
        txHash: result.txHash,
        durationMs: Date.now() - startMs,
      })
      logger.info('Token event executed successfully', {
        idempotencyKey,
        correlationId: metadata.correlationId,
        operation: operation.type,
        txHash: result.txHash,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('Token event execution failed', {
        idempotencyKey,
        correlationId: metadata.correlationId,
        operation: operation.type,
        error: errorMsg,
      })
      captureError(err, {
        context: 'token-event-consumer:execute',
        idempotencyKey,
        correlationId: metadata.correlationId,
        operation: operation.type,
      })

      const errorEvent: TokenEventErrorResponse = {
        event: 'token.event.failed',
        idempotencyKey,
        timestamp: new Date().toISOString(),
        network,
        token: { address: token.address, standard: token.standard },
        operation: { type: operation.type },
        error: { code: 'EXECUTION_FAILED', message: errorMsg },
        metadata: {
          correlationId: metadata.correlationId,
          processedBy: PROCESSED_BY,
          durationMs: Date.now() - startMs,
        },
      }
      publishResponse(channel, errorEvent)
    }

    channel.ack(msg)
  })

  logger.info('Token event consumer started, waiting for messages')
}
