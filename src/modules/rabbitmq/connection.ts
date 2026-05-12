import amqplib from 'amqplib'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import { captureError } from '../../config/sentry.js'

let _model: amqplib.ChannelModel | null = null
let _channel: amqplib.Channel | null = null

/**
 * Checks whether an amqplib error is a RabbitMQ 406 PRECONDITION_FAILED.
 * This happens when a queue already exists with different arguments.
 */
function isCode406(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 406
}

/**
 * Asserts a queue, recovering automatically from 406 PRECONDITION_FAILED.
 *
 * When a queue already exists with incompatible arguments RabbitMQ closes the
 * channel with a 406 error. This helper:
 *   1. Catches the 406
 *   2. Opens a fresh channel (the old one is closed by the broker)
 *   3. Deletes the conflicting queue
 *   4. Re-asserts it with the correct arguments
 *   5. Returns the fresh channel so the caller can continue
 */
async function assertQueueSafe(
  model: amqplib.ChannelModel,
  ch: amqplib.Channel,
  queue: string,
  options: amqplib.Options.AssertQueue = {},
): Promise<amqplib.Channel> {
  try {
    await ch.assertQueue(queue, options)
    return ch
  } catch (err: unknown) {
    if (isCode406(err)) {
      logger.warn(
        `Queue "${queue}" exists with incompatible arguments — deleting and recreating`,
        { queue },
      )
      // The broker closed the old channel; open a fresh one
      const fresh = await model.createChannel()
      await fresh.deleteQueue(queue) // force-delete regardless of consumers/messages
      await fresh.assertQueue(queue, options)
      return fresh
    }
    throw err
  }
}

export async function connect(): Promise<amqplib.Channel> {
  if (_channel) return _channel

  const safeUrl = env.RABBITMQ_URL.replace(/:[^:@]+@/, ':***@')
  logger.info('Connecting to RabbitMQ', { url: safeUrl })

  _model = await amqplib.connect(env.RABBITMQ_URL)
  _channel = await _model.createChannel()

  // ── Main processing queue (with DLX for retry/dead-letter support) ──────────
  _channel = await assertQueueSafe(_model, _channel, env.RABBITMQ_QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': `${env.RABBITMQ_QUEUE}.dlx`,
    },
  })

  // Dead-letter exchange + queue
  const dlxName = `${env.RABBITMQ_QUEUE}.dlx`
  const deadQueueName = `${env.RABBITMQ_QUEUE}.dead`
  await _channel.assertExchange(dlxName, 'direct', { durable: true })
  _channel = await assertQueueSafe(_model, _channel, deadQueueName, { durable: true })
  await _channel.bindQueue(deadQueueName, dlxName, env.RABBITMQ_QUEUE)

  // ── Token creation request: assert exchange + queue + binding ────────────────
  await _channel.assertExchange(env.EXCHANGE_REQUEST_TOKEN_CREATION, 'topic', { durable: true })
  _channel = await assertQueueSafe(_model, _channel, env.QUEUE_REQUEST_TOKEN_CREATION, {
    durable: true,
  })
  await _channel.bindQueue(env.QUEUE_REQUEST_TOKEN_CREATION, env.EXCHANGE_REQUEST_TOKEN_CREATION, '#')

  // ── Output exchanges ──────────────────────────────────────────────────────────
  await _channel.assertExchange(env.EXCHANGE_RESPONSE_TOKEN_CREATED, 'topic', { durable: true })
  await _channel.assertExchange(env.RABBITMQ_ERROR_EXCHANGE, 'topic', { durable: true })

  // ── Balance query queue + response exchange ───────────────────────────────────
  _channel = await assertQueueSafe(_model, _channel, env.QUEUE_GET_BALANCE, { durable: true })
  await _channel.assertExchange(env.EXCHANGE_BALANCE_RESPONSE, 'topic', { durable: true })

  // ── Token event exchange + durable consumer queue + response exchange ─────────
  await _channel.assertExchange(env.TOKEN_EVENT, 'topic', { durable: true })
  _channel = await assertQueueSafe(_model, _channel, 'token_event.queue', { durable: true })
  await _channel.bindQueue('token_event.queue', env.TOKEN_EVENT, '#')
  await _channel.assertExchange(env.EXCHANGE_TOKEN_EVENT_RESPONSE, 'topic', { durable: true })

  // ── Process one message at a time ─────────────────────────────────────────────
  await _channel.prefetch(env.RABBITMQ_PREFETCH)

  logger.info('RabbitMQ connected and queues/exchanges asserted', {
    queue: env.RABBITMQ_QUEUE,
    listenQueue: env.QUEUE_REQUEST_TOKEN_CREATION,
    publishExchange: env.EXCHANGE_RESPONSE_TOKEN_CREATED,
  })

  _model.on('close', () => {
    logger.warn('RabbitMQ connection closed')
    _channel = null
    _model = null
  })

  _model.on('error', (err: Error) => {
    logger.error('RabbitMQ connection error', { error: err.message })
    captureError(err, { context: 'rabbitmq-connection' })
  })

  return _channel
}

export async function disconnect(): Promise<void> {
  if (_channel) {
    await _channel.close()
    _channel = null
  }
  if (_model) {
    await _model.close()
    _model = null
  }
  logger.info('RabbitMQ disconnected')
}
