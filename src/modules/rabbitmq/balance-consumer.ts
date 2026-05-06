import type amqplib from 'amqplib'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import { captureError } from '../../config/sentry.js'
import { balanceRequestSchema, type BalanceResponse, type BalanceErrorResponse } from '../../schemas/balance.schema.js'
import { getERC20Balance } from '../token/balance.js'

const PROCESSED_BY = 'dfns-integration'
const ROUTING_KEY = 'token.balance.responded'
const ERROR_ROUTING_KEY = 'token.balance.failed'

function publishResponse(channel: amqplib.Channel, event: BalanceResponse | BalanceErrorResponse): void {
  const routingKey = event.event === 'token.balance.responded' ? ROUTING_KEY : ERROR_ROUTING_KEY
  channel.publish(
    env.EXCHANGE_BALANCE_RESPONSE,
    routingKey,
    Buffer.from(JSON.stringify(event)),
    { persistent: true, contentType: 'application/json' },
  )
}

export async function startBalanceConsumer(channel: amqplib.Channel): Promise<void> {
  logger.info('Starting balance query consumer', { queue: env.QUEUE_GET_BALANCE })

  await channel.consume(env.QUEUE_GET_BALANCE, async (msg) => {
    if (!msg) return

    const startMs = Date.now()
    let rawPayload: unknown

    // Parse JSON
    try {
      rawPayload = JSON.parse(msg.content.toString('utf-8')) as unknown
    } catch (err) {
      logger.error('Failed to parse balance request message', {
        error: err instanceof Error ? err.message : String(err),
      })
      captureError(err, { context: 'balance-consumer:parse' })
      channel.ack(msg)
      return
    }

    // Validate schema
    const parsed = balanceRequestSchema.safeParse(rawPayload)
    if (!parsed.success) {
      const issues = parsed.error.flatten()
      const idempotencyKey = (rawPayload as Record<string, unknown>)?.['idempotencyKey'] as string ?? 'unknown'
      const correlationId = (rawPayload as Record<string, unknown>)?.['metadata'] as Record<string, unknown> | undefined
      logger.error('Invalid balance request message', { issues, idempotencyKey })
      const validationError = new Error(`Invalid balance request: ${JSON.stringify(issues.fieldErrors)}`)
      captureError(validationError, { context: 'balance-consumer:validation', idempotencyKey, issues })

      const errorEvent: BalanceErrorResponse = {
        event: 'token.balance.failed',
        idempotencyKey,
        timestamp: new Date().toISOString(),
        network: { name: 'unknown', chainId: 0 },
        error: { code: 'VALIDATION_ERROR', message: validationError.message },
        metadata: {
          correlationId: String(correlationId?.['correlationId'] ?? 'unknown'),
          processedBy: PROCESSED_BY,
          durationMs: Date.now() - startMs,
        },
      }
      publishResponse(channel, errorEvent)
      channel.ack(msg)
      return
    }

    const req = parsed.data
    const { idempotencyKey, network, token, wallet, metadata } = req

    logger.info('Processing balance query', {
      idempotencyKey,
      correlationId: metadata.correlationId,
      network: network.name,
      tokenAddress: token.address,
      walletAddress: wallet.address,
    })

    try {
      const balance = await getERC20Balance(network.name, token.address, wallet.address)

      const response: BalanceResponse = {
        event: 'token.balance.responded',
        idempotencyKey,
        timestamp: new Date().toISOString(),
        network,
        token: {
          address: token.address,
          name: balance.name,
          symbol: balance.symbol,
          decimals: balance.decimals,
        },
        wallet,
        balance: { raw: balance.raw, formatted: balance.formatted },
        metadata: {
          correlationId: metadata.correlationId,
          processedBy: PROCESSED_BY,
          durationMs: Date.now() - startMs,
        },
      }

      publishResponse(channel, response)
      logger.info('Balance query succeeded', {
        idempotencyKey,
        correlationId: metadata.correlationId,
        balance: balance.formatted,
        symbol: balance.symbol,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('Balance query failed', {
        idempotencyKey,
        correlationId: metadata.correlationId,
        error: errorMsg,
      })
      captureError(err, { context: 'balance-consumer:query', idempotencyKey, correlationId: metadata.correlationId })

      const errorEvent: BalanceErrorResponse = {
        event: 'token.balance.failed',
        idempotencyKey,
        timestamp: new Date().toISOString(),
        network,
        error: { code: 'QUERY_FAILED', message: errorMsg },
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

  logger.info('Balance consumer started, waiting for messages')
}
