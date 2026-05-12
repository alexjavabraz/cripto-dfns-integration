import type amqplib from 'amqplib'
import { env } from '../../config/env.js'
import { Sentry, captureMessage } from '../../config/sentry.js'
import type { CreationSuccessEvent, CreationErrorEvent } from '../../schemas/creation-request.schema.js'

export function publishSuccess(channel: amqplib.Channel, event: CreationSuccessEvent): void {
  Sentry.addBreadcrumb({
    category: 'rabbitmq.publish',
    message: `Published token.creation.succeeded → ${env.RABBITMQ_CREATED_EXCHANGE}`,
    data: event as unknown as Record<string, unknown>,
    level: 'info',
  })
  captureMessage('RabbitMQ message published: token.creation.succeeded', 'info', {
    exchange: env.RABBITMQ_CREATED_EXCHANGE,
    routingKey: 'token.creation.succeeded',
    idempotencyKey: event.idempotencyKey,
    network: event.network.name,
    token: event.token,
    deployment: event.deployment,
  })
  channel.publish(
    env.RABBITMQ_CREATED_EXCHANGE,
    'token.creation.succeeded',
    Buffer.from(JSON.stringify(event)),
    { persistent: true },
  )
}

export function publishError(channel: amqplib.Channel, event: CreationErrorEvent): void {
  Sentry.addBreadcrumb({
    category: 'rabbitmq.publish',
    message: `Published token.creation.failed → ${env.RABBITMQ_ERROR_EXCHANGE}`,
    data: event as unknown as Record<string, unknown>,
    level: 'warning',
  })
  captureMessage('RabbitMQ message published: token.creation.failed', 'warning', {
    exchange: env.RABBITMQ_ERROR_EXCHANGE,
    routingKey: 'token.creation.failed',
    idempotencyKey: event.idempotencyKey,
    network: event.network.name,
    errorCode: event.error.code,
    errorMessage: event.error.message,
  })
  channel.publish(
    env.RABBITMQ_ERROR_EXCHANGE,
    'token.creation.failed',
    Buffer.from(JSON.stringify(event)),
    { persistent: true },
  )
}
