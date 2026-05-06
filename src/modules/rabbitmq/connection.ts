import amqplib from 'amqplib'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import { captureError } from '../../config/sentry.js'

let _model: amqplib.ChannelModel | null = null
let _channel: amqplib.Channel | null = null

export async function connect(): Promise<amqplib.Channel> {
  if (_channel) return _channel

  const safeUrl = env.RABBITMQ_URL.replace(/:[^:@]+@/, ':***@')
  logger.info('Connecting to RabbitMQ', { url: safeUrl })

  _model = await amqplib.connect(env.RABBITMQ_URL)
  _channel = await _model.createChannel()

  // Declare main queue as durable
  await _channel.assertQueue(env.RABBITMQ_QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': `${env.RABBITMQ_QUEUE}.dlx`,
    },
  })

  // Declare dead-letter exchange + queue
  const dlxName = `${env.RABBITMQ_QUEUE}.dlx`
  const deadQueueName = `${env.RABBITMQ_QUEUE}.dead`
  await _channel.assertExchange(dlxName, 'direct', { durable: true })
  await _channel.assertQueue(deadQueueName, { durable: true })
  await _channel.bindQueue(deadQueueName, dlxName, env.RABBITMQ_QUEUE)

  // Declare creation request queue (errors reported via exchange, no DLX needed)
  await _channel.assertQueue(env.RABBITMQ_CREATION_QUEUE, { durable: true })

  // Declare output exchanges (topic — matches existing broker configuration)
  await _channel.assertExchange(env.RABBITMQ_CREATED_EXCHANGE, 'topic', { durable: true })
  await _channel.assertExchange(env.RABBITMQ_ERROR_EXCHANGE, 'topic', { durable: true })

  // Balance query queue + response exchange
  await _channel.assertQueue(env.QUEUE_GET_BALANCE, { durable: true })
  await _channel.assertExchange(env.EXCHANGE_BALANCE_RESPONSE, 'topic', { durable: true })

  // Token event exchange + durable consumer queue + response exchange
  await _channel.assertExchange(env.TOKEN_EVENT, 'topic', { durable: true })
  await _channel.assertQueue('token_event.queue', { durable: true })
  await _channel.bindQueue('token_event.queue', env.TOKEN_EVENT, '#')
  await _channel.assertExchange(env.EXCHANGE_TOKEN_EVENT_RESPONSE, 'topic', { durable: true })

  // Process one message at a time
  await _channel.prefetch(env.RABBITMQ_PREFETCH)

  logger.info('RabbitMQ connected and queues/exchanges asserted', {
    queue: env.RABBITMQ_QUEUE,
    creationQueue: env.RABBITMQ_CREATION_QUEUE,
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
