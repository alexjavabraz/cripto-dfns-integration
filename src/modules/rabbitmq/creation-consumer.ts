import type amqplib from 'amqplib'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import { captureError } from '../../config/sentry.js'
import {
  creationRequestMessageSchema,
  type CreationRequestMessage,
  type CreationSuccessEvent,
  type CreationErrorEvent,
} from '../../schemas/creation-request.schema.js'
import { processTokenMessage } from '../token/processor.js'
import { newCorrelationId } from '../../utils/correlation.js'
import { getNetworkConfig } from '../token/networks.js'
import { publishSuccess, publishError } from './publisher.js'

const PROCESSED_KEYS = new Set<string>()

const PROCESSED_BY = 'dfns-integration'

function parseMessage(msg: amqplib.Message): unknown {
  const content = msg.content.toString('utf-8')
  try {
    return JSON.parse(content) as unknown
  } catch {
    throw new Error(`Non-JSON RabbitMQ message received: ${content.slice(0, 200)}`)
  }
}

function categorizeError(error: unknown): {
  code: string
  message: string
  details?: string
  retryable: boolean
} {
  const msg = error instanceof Error ? error.message : String(error)
  const lower = msg.toLowerCase()
  if (lower.startsWith('invalid token message') || lower.includes('validation')) {
    return { code: 'VALIDATION_ERROR', message: msg, retryable: false }
  }
  if (lower.includes('network') || lower.includes('rpc') || lower.includes('econnrefused')) {
    return { code: 'NETWORK_ERROR', message: msg, retryable: true }
  }
  if (lower.includes('dfns') || lower.includes('broadcast') || lower.includes('deploy')) {
    return { code: 'DEPLOYMENT_FAILED', message: msg, retryable: false }
  }
  return { code: 'UNKNOWN_ERROR', message: msg, retryable: false }
}

function mapToTokenMessage(msg: CreationRequestMessage): unknown {
  const base = {
    type: msg.token.standard,
    idempotencyKey: msg.idempotencyKey,
    timestamp: msg.timestamp,
    network: msg.network.name,
    correlationId: newCorrelationId(), // must be UUID for internal schema
    ownerAddress: msg.token.ownerAddress,
  }
  switch (msg.token.standard) {
    case 'ERC20':
      return {
        ...base,
        name: msg.token.name,
        symbol: msg.token.symbol,
        decimals: msg.params.erc20?.decimals ?? 18,
        supply: msg.params.erc20?.supply,
      }
    case 'ERC721':
      return {
        ...base,
        name: msg.token.name,
        symbol: msg.token.symbol,
        metadata: msg.params.erc721?.baseUri ? { uri: msg.params.erc721.baseUri } : undefined,
      }
    case 'ERC1155':
      return {
        ...base,
        metadata: { uri: msg.params.erc1155?.uri },
      }
  }
}

export async function startCreationConsumer(channel: amqplib.Channel): Promise<void> {
  logger.info('Starting creation request consumer', { queue: env.RABBITMQ_CREATION_QUEUE })

  await channel.consume(env.RABBITMQ_CREATION_QUEUE, async (msg) => {
    if (!msg) return

    const startMs = Date.now()

    // Parse JSON
    let rawPayload: unknown
    try {
      rawPayload = parseMessage(msg)
    } catch (parseError) {
      logger.error('Failed to parse creation request message', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
      })
      captureError(parseError, { context: 'creation-consumer:parse' })
      channel.ack(msg)
      return
    }

    // Validate input schema
    const parsed = creationRequestMessageSchema.safeParse(rawPayload)
    if (!parsed.success) {
      const issues = parsed.error.flatten()
      logger.warn('Invalid creation request message', { issues })
      captureError(new Error(`VALIDATION_ERROR: ${JSON.stringify(issues.fieldErrors)}`), {
        context: 'creation-consumer:validation',
        idempotencyKey: (rawPayload as Record<string, unknown>)?.['idempotencyKey'],
        issues,
      })
      const errorEvent: CreationErrorEvent = {
        event: 'token.creation.failed',
        idempotencyKey: (rawPayload as Record<string, unknown>)?.['idempotencyKey'] as string ?? 'unknown',
        timestamp: new Date().toISOString(),
        network: { name: 'unknown', chainId: 0 },
        token: { standard: 'unknown' },
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid creation request: ${JSON.stringify(issues.fieldErrors)}`,
          retryable: false,
        },
        metadata: {
          correlationId: (rawPayload as Record<string, unknown>)?.['metadata'] as unknown as string ?? 'unknown',
          processedBy: PROCESSED_BY,
          durationMs: Date.now() - startMs,
        },
      }
      publishError(channel, errorEvent)
      channel.ack(msg)
      return
    }

    const creationMsg = parsed.data
    const { idempotencyKey, metadata, network, token } = creationMsg

    // Idempotency check
    if (PROCESSED_KEYS.has(idempotencyKey)) {
      logger.warn('Duplicate creation request detected', { idempotencyKey, correlationId: metadata.correlationId })
      captureError(new Error(`DUPLICATE_REQUEST: idempotencyKey "${idempotencyKey}" already processed`), {
        context: 'creation-consumer:idempotency',
        idempotencyKey,
        correlationId: metadata.correlationId,
      })
      const errorEvent: CreationErrorEvent = {
        event: 'token.creation.failed',
        idempotencyKey,
        timestamp: new Date().toISOString(),
        network: { name: network.name, chainId: network.chainId },
        token: { standard: token.standard, name: token.name, symbol: token.symbol },
        error: {
          code: 'DUPLICATE_REQUEST',
          message: `Idempotency key already processed: ${idempotencyKey}`,
          retryable: false,
        },
        metadata: {
          correlationId: metadata.correlationId,
          processedBy: PROCESSED_BY,
          durationMs: Date.now() - startMs,
        },
      }
      publishError(channel, errorEvent)
      channel.ack(msg)
      return
    }

    // Process deployment
    try {
      const tokenPayload = mapToTokenMessage(creationMsg)
      const result = await processTokenMessage(tokenPayload)

      PROCESSED_KEYS.add(idempotencyKey)

      const networkConfig = getNetworkConfig(network.name)
      const successEvent: CreationSuccessEvent = {
        event: 'token.creation.succeeded',
        idempotencyKey,
        timestamp: new Date().toISOString(),
        network: { name: network.name, chainId: network.chainId },
        token: {
          standard: token.standard,
          name: token.name,
          symbol: token.symbol,
          contractAddress: result.contractAddress,
        },
        deployment: {
          contractAddress: result.contractAddress,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
          deployerAddress: result.deployerAddress,
          gasUsed: result.gasUsed,
          effectiveGasPrice: result.effectiveGasPrice,
        },
        explorer: {
          transactionUrl: `${networkConfig.explorerUrl}/tx/${result.transactionHash}`,
          contractUrl: `${networkConfig.explorerUrl}/address/${result.contractAddress}`,
        },
        metadata: {
          correlationId: metadata.correlationId,
          processedBy: PROCESSED_BY,
          durationMs: Date.now() - startMs,
        },
      }

      publishSuccess(channel, successEvent)
      logger.info('Creation request processed successfully', {
        idempotencyKey,
        correlationId: metadata.correlationId,
        contractAddress: result.contractAddress,
        txHash: result.transactionHash,
      })
    } catch (error) {
      captureError(error, { idempotencyKey, correlationId: metadata.correlationId })
      const categorized = categorizeError(error)
      const errorEvent: CreationErrorEvent = {
        event: 'token.creation.failed',
        idempotencyKey,
        timestamp: new Date().toISOString(),
        network: { name: network.name, chainId: network.chainId },
        token: { standard: token.standard, name: token.name, symbol: token.symbol },
        error: categorized,
        metadata: {
          correlationId: metadata.correlationId,
          processedBy: PROCESSED_BY,
          durationMs: Date.now() - startMs,
        },
      }
      publishError(channel, errorEvent)
      logger.error('Creation request failed', {
        idempotencyKey,
        correlationId: metadata.correlationId,
        errorCode: categorized.code,
        error: categorized.message,
      })
    }

    channel.ack(msg)
  })

  logger.info('Creation consumer started, waiting for messages')
}
