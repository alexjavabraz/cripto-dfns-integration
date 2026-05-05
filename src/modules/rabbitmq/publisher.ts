import type amqplib from 'amqplib'
import { env } from '../../config/env.js'
import type { CreationSuccessEvent, CreationErrorEvent } from '../../schemas/creation-request.schema.js'

export function publishSuccess(channel: amqplib.Channel, event: CreationSuccessEvent): void {
  channel.publish(
    env.RABBITMQ_CREATED_EXCHANGE,
    'token.creation.succeeded',
    Buffer.from(JSON.stringify(event)),
    { persistent: true },
  )
}

export function publishError(channel: amqplib.Channel, event: CreationErrorEvent): void {
  channel.publish(
    env.RABBITMQ_ERROR_EXCHANGE,
    'token.creation.failed',
    Buffer.from(JSON.stringify(event)),
    { persistent: true },
  )
}
