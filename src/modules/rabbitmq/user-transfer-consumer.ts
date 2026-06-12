/**
 * Consumer for user-initiated transfer requests.
 *
 * After admin approval, the BFF publishes a message to EXCHANGE_USER_TRANSFER_REQUEST.
 * This consumer executes the ERC-20 transfer using the *user's own DFNS wallet*
 * (not the platform/network wallet), then publishes the result to EXCHANGE_USER_TRANSFER_RESPONSE.
 */
import { z } from 'zod'
import type amqplib from 'amqplib'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import { captureError, captureMessage } from '../../config/sentry.js'
import { executeTokenTransfer } from '../token/token-transfer.js'
import type { TokenTransfer } from '../../schemas/token-transfer.schema.js'

const PROCESSED_BY = 'dfns-integration'

const ethereumAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Ethereum address')

const userTransferMessageSchema = z.object({
  event: z.literal('user.transfer.approved'),
  requestId: z.string().min(1),
  userId: z.string().min(1),
  userWalletId: z.string().min(1),
  fromAddress: ethereumAddress,
  toAddress: ethereumAddress,
  contractAddress: ethereumAddress,
  network: z.string().min(1),
  amount: z.string().min(1),
  decimals: z.number().int().min(0).default(18),
  metadata: z.object({ correlationId: z.string().optional() }).optional(),
})

type UserTransferMessage = z.infer<typeof userTransferMessageSchema>

interface UserTransferSuccessResponse {
  event: 'user.transfer.completed'
  requestId: string
  userId: string
  result: { txHash: string; blockNumber: number; gasUsed: string }
  metadata: { correlationId?: string; processedBy: string; durationMs: number }
}

interface UserTransferErrorResponse {
  event: 'user.transfer.failed'
  requestId: string
  userId: string
  error: { code: string; message: string }
  metadata: { correlationId?: string; processedBy: string; durationMs: number }
}

function publishResponse(
  channel: amqplib.Channel,
  event: UserTransferSuccessResponse | UserTransferErrorResponse,
): void {
  const routingKey =
    event.event === 'user.transfer.completed' ? 'user.transfer.completed' : 'user.transfer.failed'
  channel.publish(
    env.EXCHANGE_USER_TRANSFER_RESPONSE,
    routingKey,
    Buffer.from(JSON.stringify(event)),
    { persistent: true, contentType: 'application/json' },
  )
}

function buildFakeTransferEvent(msg: UserTransferMessage): TokenTransfer {
  return {
    event: 'token.transfer.requested' as const,
    idempotencyKey: msg.requestId,
    requestedAt: new Date().toISOString(),
    requester: { userId: msg.userId },
    network: msg.network,
    token: { contractAddress: msg.contractAddress, decimals: msg.decimals },
    transfer: { toAddress: msg.toAddress, amount: msg.amount },
    metadata: { correlationId: msg.metadata?.correlationId },
  }
}

export async function startUserTransferConsumer(channel: amqplib.Channel): Promise<void> {
  const exchange = env.EXCHANGE_USER_TRANSFER_REQUEST
  const queue = env.QUEUE_USER_TRANSFER_REQUEST

  logger.info('Starting user transfer consumer', { exchange, queue })

  await channel.assertExchange(exchange, 'topic', { durable: true })
  await channel.assertQueue(queue, { durable: true })
  await channel.bindQueue(queue, exchange, '#')

  await channel.consume(queue, async (msg) => {
    if (!msg) return

    const startMs = Date.now()
    let rawPayload: unknown

    // Parse JSON
    try {
      rawPayload = JSON.parse(msg.content.toString('utf-8')) as unknown
    } catch (err) {
      logger.error('Failed to parse user transfer message', {
        queue,
        rawContent: msg.content.toString('utf-8').slice(0, 500),
        error: err instanceof Error ? err.message : String(err),
      })
      captureError(err, { context: 'user-transfer-consumer:parse' })
      channel.ack(msg)
      return
    }

    // Validate schema
    const parsed = userTransferMessageSchema.safeParse(rawPayload)
    if (!parsed.success) {
      const issues = parsed.error.flatten()
      const raw = rawPayload as Record<string, unknown>
      const requestId = String(raw?.['requestId'] ?? 'unknown')
      const userId = String(raw?.['userId'] ?? 'unknown')

      logger.error('Invalid user transfer message', { queue, rawPayload, issues, requestId })
      captureError(new Error(`Invalid user transfer: ${JSON.stringify(issues.fieldErrors)}`), {
        context: 'user-transfer-consumer:validation',
        requestId,
        issues,
      })

      const errorEvent: UserTransferErrorResponse = {
        event: 'user.transfer.failed',
        requestId,
        userId,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Validation failed: ${JSON.stringify(issues.fieldErrors)}`,
        },
        metadata: { processedBy: PROCESSED_BY, durationMs: Date.now() - startMs },
      }
      publishResponse(channel, errorEvent)
      channel.ack(msg)
      return
    }

    const message = parsed.data
    const { requestId, userId, userWalletId, metadata } = message

    logger.info('Processing user transfer', {
      requestId,
      userId,
      userWalletId,
      network: message.network,
      contractAddress: message.contractAddress,
      toAddress: message.toAddress,
      amount: message.amount,
    })

    try {
      const transferEvent = buildFakeTransferEvent(message)
      const result = await executeTokenTransfer(transferEvent, userWalletId)

      const response: UserTransferSuccessResponse = {
        event: 'user.transfer.completed',
        requestId,
        userId,
        result,
        metadata: {
          ...(metadata?.correlationId !== undefined && { correlationId: metadata.correlationId }),
          processedBy: PROCESSED_BY,
          durationMs: Date.now() - startMs,
        },
      }

      publishResponse(channel, response)
      captureMessage('User transfer succeeded', 'info', {
        requestId,
        userId,
        txHash: result.txHash,
        durationMs: Date.now() - startMs,
      })
      logger.info('User transfer executed successfully', { requestId, txHash: result.txHash })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('User transfer execution failed', {
        requestId,
        userId,
        network: message.network,
        error: errorMsg,
      })
      captureError(err, {
        context: 'user-transfer-consumer:execute',
        requestId,
        userId,
        network: message.network,
      })

      const errorEvent: UserTransferErrorResponse = {
        event: 'user.transfer.failed',
        requestId,
        userId,
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

  logger.info('User transfer consumer started, waiting for messages')
}
