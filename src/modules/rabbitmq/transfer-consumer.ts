import type amqplib from 'amqplib'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import { captureError, captureMessage, Sentry } from '../../config/sentry.js'
import {
  tokenTransferSchema,
  type TokenTransferSuccessResponse,
  type TokenTransferErrorResponse,
} from '../../schemas/token-transfer.schema.js'
import { executeTokenTransfer } from '../token/token-transfer.js'

const PROCESSED_BY = 'dfns-integration'

function publishResponse(
  channel: amqplib.Channel,
  event: TokenTransferSuccessResponse | TokenTransferErrorResponse,
): void {
  const routingKey = event.event === 'token.transfer.succeeded'
    ? 'token.transfer.succeeded'
    : 'token.transfer.failed'
  channel.publish(
    env.EXCHANGE_TOKEN_TRANSFER_RESPONSE,
    routingKey,
    Buffer.from(JSON.stringify(event)),
    { persistent: true, contentType: 'application/json' },
  )
}

export async function startTransferConsumer(channel: amqplib.Channel): Promise<void> {
  logger.info('Starting token transfer consumer', {
    exchange: env.EXCHANGE_TOKEN_TRANSFER_REQUEST,
    queue: env.QUEUE_TOKEN_TRANSFER_REQUEST,
  })

  await channel.consume(env.QUEUE_TOKEN_TRANSFER_REQUEST, async (msg) => {
    if (!msg) return

    const startMs = Date.now()
    let rawPayload: unknown

    // Parse JSON
    try {
      rawPayload = JSON.parse(msg.content.toString('utf-8')) as unknown
      Sentry.addBreadcrumb({
        category: 'rabbitmq.receive',
        message: `Message received from queue ${env.QUEUE_TOKEN_TRANSFER_REQUEST}`,
        data: rawPayload as Record<string, unknown>,
        level: 'info',
      })
    } catch (err) {
      logger.error('Failed to parse token transfer message', {
        queue: env.QUEUE_TOKEN_TRANSFER_REQUEST,
        rawContent: msg.content.toString('utf-8').slice(0, 500),
        error: err instanceof Error ? err.message : String(err),
      })
      captureError(err, { context: 'transfer-consumer:parse' })
      channel.ack(msg)
      return
    }

    // Validate schema
    const parsed = tokenTransferSchema.safeParse(rawPayload)
    if (!parsed.success) {
      const issues = parsed.error.flatten()
      const raw = rawPayload as Record<string, unknown>
      const idempotencyKey = String(raw?.['idempotencyKey'] ?? 'unknown')
      const requester = (raw?.['requester'] as Record<string, unknown>) ?? {}

      logger.error('Invalid token transfer message', {
        queue: env.QUEUE_TOKEN_TRANSFER_REQUEST,
        rawPayload,
        issues,
        idempotencyKey,
      })
      const validationError = new Error(`Invalid token transfer: ${JSON.stringify(issues.fieldErrors)}`)
      captureError(validationError, { context: 'transfer-consumer:validation', idempotencyKey, issues })

      const errorEvent: TokenTransferErrorResponse = {
        event: 'token.transfer.failed',
        idempotencyKey,
        timestamp: new Date().toISOString(),
        network: String(raw?.['network'] ?? 'unknown'),
        requester: { userId: String(requester['userId'] ?? 'unknown') },
        token: { contractAddress: '0x0000000000000000000000000000000000000000', decimals: 18 },
        transfer: { toAddress: '0x0000000000000000000000000000000000000000', amount: '0' },
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
    const { idempotencyKey, network, token, transfer, requester, metadata } = event

    logger.info('Processing token transfer', {
      idempotencyKey,
      correlationId: metadata?.correlationId,
      network,
      contractAddress: token.contractAddress,
      toAddress: transfer.toAddress,
      amount: transfer.amount,
    })

    try {
      const result = await executeTokenTransfer(event)

      const response: TokenTransferSuccessResponse = {
        event: 'token.transfer.succeeded',
        idempotencyKey,
        timestamp: new Date().toISOString(),
        network,
        requester: {
          userId: requester.userId,
          ...(requester.email !== undefined && { email: requester.email }),
          ...(requester.ip   !== undefined && { ip:    requester.ip }),
        },
        token,
        transfer,
        result,
        metadata: {
          ...(metadata?.correlationId !== undefined && { correlationId: metadata.correlationId }),
          processedBy: PROCESSED_BY,
          durationMs: Date.now() - startMs,
        },
      }

      publishResponse(channel, response)
      captureMessage('RabbitMQ message processed: token transfer succeeded', 'info', {
        queue: env.QUEUE_TOKEN_TRANSFER_REQUEST,
        idempotencyKey,
        correlationId: metadata?.correlationId,
        network,
        contractAddress: token.contractAddress,
        toAddress: transfer.toAddress,
        amount: transfer.amount,
        txHash: result.txHash,
        durationMs: Date.now() - startMs,
      })
      logger.info('Token transfer executed successfully', {
        idempotencyKey,
        correlationId: metadata?.correlationId,
        txHash: result.txHash,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('Token transfer execution failed', {
        idempotencyKey,
        correlationId: metadata?.correlationId,
        network,
        contractAddress: token.contractAddress,
        toAddress: transfer.toAddress,
        amount: transfer.amount,
        error: errorMsg,
      })
      captureError(err, {
        context: 'transfer-consumer:execute',
        idempotencyKey,
        correlationId: metadata?.correlationId,
        network,
        contractAddress: token.contractAddress,
      })

      const errorEvent: TokenTransferErrorResponse = {
        event: 'token.transfer.failed',
        idempotencyKey,
        timestamp: new Date().toISOString(),
        network,
        requester: {
          userId: requester.userId,
          ...(requester.email !== undefined && { email: requester.email }),
          ...(requester.ip   !== undefined && { ip:    requester.ip }),
        },
        token,
        transfer,
        error: { code: 'EXECUTION_FAILED', message: errorMsg },
        metadata: {
          ...(metadata?.correlationId !== undefined && { correlationId: metadata.correlationId }),
          processedBy: PROCESSED_BY,
          durationMs: Date.now() - startMs,
        },
      }
      publishResponse(channel, errorEvent)
    }

    channel.ack(msg)
  })

  logger.info('Token transfer consumer started, waiting for messages')
}
