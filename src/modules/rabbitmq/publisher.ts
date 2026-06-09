import type amqplib from 'amqplib'
import { env } from '../../config/env.js'
import { Sentry, captureMessage } from '../../config/sentry.js'
import type {
  CreationSuccessEvent,
  CreationErrorEvent,
} from '../../schemas/creation-request.schema.js'

export function publishSuccess(channel: amqplib.Channel, event: CreationSuccessEvent): void {
  Sentry.addBreadcrumb({
    category: 'rabbitmq.publish',
    message: `Published token.creation.succeeded → ${env.EXCHANGE_RESPONSE_TOKEN_CREATED}`,
    data: event,
    level: 'info',
  })
  captureMessage('RabbitMQ message published: token.creation.succeeded', 'info', {
    exchange: env.EXCHANGE_RESPONSE_TOKEN_CREATED,
    routingKey: 'token.creation.succeeded',
    idempotencyKey: event.idempotencyKey,
    network: event.network.name,
    token: event.token,
    deployment: event.deployment,
  })
  channel.publish(
    env.EXCHANGE_RESPONSE_TOKEN_CREATED,
    'token.creation.succeeded',
    Buffer.from(JSON.stringify(event)),
    { persistent: true },
  )
}

export function publishError(channel: amqplib.Channel, event: CreationErrorEvent): void {
  Sentry.addBreadcrumb({
    category: 'rabbitmq.publish',
    message: `Published token.creation.failed → ${env.RABBITMQ_ERROR_EXCHANGE}`,
    data: event,
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
