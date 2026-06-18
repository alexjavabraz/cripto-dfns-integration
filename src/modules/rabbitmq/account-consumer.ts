import type amqplib from 'amqplib'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import { captureError, captureMessage, Sentry } from '../../config/sentry.js'
import {
  accountCreateSchema,
  type AccountCreateSuccessResponse,
  type AccountCreateErrorResponse,
} from '../../schemas/account-create.schema.js'
import { getDfnsClient } from '../dfns/client.js'
import type { CreateWalletBody } from '@dfns/sdk/generated/wallets/types.js'
import { sendGasToNewWallet } from '../token/gas-fund.js'

const PROCESSED_BY = 'dfns-integration'

function publishResponse(
  channel: amqplib.Channel,
  event: AccountCreateSuccessResponse | AccountCreateErrorResponse,
): void {
  const routingKey =
    event.event === 'account.create.succeeded'
      ? 'account.create.succeeded'
      : 'account.create.failed'
  channel.publish(
    env.EXCHANGE_ACCOUNT_CREATE_RESPONSE,
    routingKey,
    Buffer.from(JSON.stringify(event)),
    { persistent: true, contentType: 'application/json' },
  )
}

export async function startAccountConsumer(channel: amqplib.Channel): Promise<void> {
  logger.info('Starting account create consumer', {
    exchange: env.EXCHANGE_ACCOUNT_CREATE_REQUEST,
    queue: env.QUEUE_ACCOUNT_CREATE_REQUEST,
  })

  await channel.consume(env.QUEUE_ACCOUNT_CREATE_REQUEST, async (msg) => {
    if (!msg) return

    const startMs = Date.now()
    let rawPayload: unknown

    // Parse JSON
    try {
      rawPayload = JSON.parse(msg.content.toString('utf-8')) as unknown
      Sentry.addBreadcrumb({
        category: 'rabbitmq.receive',
        message: `Message received from queue ${env.QUEUE_ACCOUNT_CREATE_REQUEST}`,
        data: rawPayload as Record<string, unknown>,
        level: 'info',
      })
    } catch (err) {
      logger.error('Failed to parse account create message', {
        queue: env.QUEUE_ACCOUNT_CREATE_REQUEST,
        rawContent: msg.content.toString('utf-8').slice(0, 500),
        error: err instanceof Error ? err.message : String(err),
      })
      captureError(err, { context: 'account-consumer:parse' })
      channel.ack(msg)
      return
    }

    // Validate schema
    const parsed = accountCreateSchema.safeParse(rawPayload)
    if (!parsed.success) {
      const issues = parsed.error.flatten()
      const raw = rawPayload as Record<string, unknown>
      const idempotencyKey = String(raw?.['idempotencyKey'] ?? 'unknown')
      const userId = String(raw?.['userId'] ?? 'unknown')

      logger.error('Invalid account create message', {
        queue: env.QUEUE_ACCOUNT_CREATE_REQUEST,
        rawPayload,
        issues,
        idempotencyKey,
        userId,
      })
      const validationError = new Error(
        `Invalid account create: ${JSON.stringify(issues.fieldErrors)}`,
      )
      captureError(validationError, {
        context: 'account-consumer:validation',
        idempotencyKey,
        issues,
      })

      const errorEvent: AccountCreateErrorResponse = {
        event: 'account.create.failed',
        userId,
        idempotencyKey,
        error: { code: 'VALIDATION_ERROR', message: validationError.message },
        timestamp: new Date().toISOString(),
        metadata: { processedBy: PROCESSED_BY, durationMs: Date.now() - startMs },
      }
      publishResponse(channel, errorEvent)
      channel.ack(msg)
      return
    }

    const event = parsed.data
    const { idempotencyKey, userId, network } = event

    logger.info('Processing account create', { idempotencyKey, userId, network })

    try {
      const wallet = await getDfnsClient().wallets.createWallet({
        body: { network: network as CreateWalletBody['network'], name: userId },
      })

      const response: AccountCreateSuccessResponse = {
        event: 'account.create.succeeded',
        userId,
        idempotencyKey,
        wallet: {
          id: wallet.id,
          network: wallet.network,
          ...(wallet.address !== undefined && { address: wallet.address }),
        } as { id: string; network: string; address: string },
        timestamp: new Date().toISOString(),
        metadata: { processedBy: PROCESSED_BY, durationMs: Date.now() - startMs },
      }

      publishResponse(channel, response)
      captureMessage('RabbitMQ message processed: account create succeeded', 'info', {
        queue: env.QUEUE_ACCOUNT_CREATE_REQUEST,
        idempotencyKey,
        userId,
        network,
        walletId: wallet.id,
        address: wallet.address,
        durationMs: Date.now() - startMs,
      })
      logger.info('Account wallet created successfully', {
        idempotencyKey,
        userId,
        walletId: wallet.id,
        address: wallet.address,
      })

      // Best-effort gas funding — does not block consumer ack
      if (wallet.address) {
        sendGasToNewWallet(wallet.address, network).catch(() => {
          // errors already logged inside sendGasToNewWallet
        })
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('Account wallet creation failed', {
        idempotencyKey,
        userId,
        network,
        error: errorMsg,
      })
      captureError(err, {
        context: 'account-consumer:execute',
        idempotencyKey,
        userId,
        network,
      })

      const errorEvent: AccountCreateErrorResponse = {
        event: 'account.create.failed',
        userId,
        idempotencyKey,
        error: { code: 'EXECUTION_FAILED', message: errorMsg },
        timestamp: new Date().toISOString(),
        metadata: { processedBy: PROCESSED_BY, durationMs: Date.now() - startMs },
      }
      publishResponse(channel, errorEvent)
    }

    channel.ack(msg)
  })

  logger.info('Account create consumer started, waiting for messages')
}
