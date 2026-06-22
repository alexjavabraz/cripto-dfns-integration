import { describe, it, expect, vi, beforeEach } from 'vitest'
import type amqplib from 'amqplib'

vi.mock('../../config/env.js', () => ({
  env: {
    EXCHANGE_TOKEN_TRANSFER_REQUEST: 'bff_publish_token_transfer_request',
    QUEUE_TOKEN_TRANSFER_REQUEST: 'dfns_listen_token_transfer_request',
    EXCHANGE_TOKEN_TRANSFER_RESPONSE: 'dfns_publish_token_transfer_response',
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  },
}))

vi.mock('../../config/sentry.js', () => ({
  captureError: vi.fn(),
  captureMessage: vi.fn(),
  Sentry: { addBreadcrumb: vi.fn() },
}))

vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { mockExecuteTokenTransfer } = vi.hoisted(() => ({ mockExecuteTokenTransfer: vi.fn() }))
vi.mock('../token/token-transfer.js', () => ({
  executeTokenTransfer: mockExecuteTokenTransfer,
}))

import { startTransferConsumer } from './transfer-consumer.js'

const validAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

function makeMsg(content: unknown): amqplib.Message {
  return {
    content: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)),
    properties: { headers: {} },
    fields: { deliveryTag: 1, redelivered: false, exchange: '', routingKey: '' },
  } as unknown as amqplib.Message
}

function makeChannel() {
  let consumeCallback: ((msg: amqplib.Message | null) => Promise<void>) | null = null
  return {
    consume: vi.fn(async (_q: string, cb: (msg: amqplib.Message | null) => Promise<void>) => {
      consumeCallback = cb
    }),
    ack: vi.fn(),
    publish: vi.fn(),
    _triggerConsume: async (msg: amqplib.Message | null) => {
      if (consumeCallback) await consumeCallback(msg)
    },
  }
}

const validTransferMessage = {
  event: 'token.transfer.requested',
  idempotencyKey: 'idem-transfer-001',
  requestedAt: '2024-01-01T00:00:00.000Z',
  requester: { userId: 'user-001', email: 'user@example.com' },
  network: 'ethereumsepolia',
  token: { contractAddress: validAddress, decimals: 18 },
  transfer: { toAddress: validAddress, amount: '10.5' },
  metadata: { correlationId: 'corr-001' },
}

describe('startTransferConsumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts consumer on correct queue', async () => {
    const channel = makeChannel()
    await startTransferConsumer(channel as unknown as amqplib.Channel)
    expect(channel.consume).toHaveBeenCalledWith(
      'dfns_listen_token_transfer_request',
      expect.any(Function),
    )
  })

  it('ignores null messages', async () => {
    const channel = makeChannel()
    await startTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(null)
    expect(channel.ack).not.toHaveBeenCalled()
  })

  it('acks on invalid JSON', async () => {
    const channel = makeChannel()
    await startTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg('not json {'))
    expect(channel.ack).toHaveBeenCalled()
  })

  it('acks and publishes error for invalid schema', async () => {
    const channel = makeChannel()
    await startTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg({ event: 'wrong.event' }))
    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('token.transfer.failed')
    expect(payload.error.code).toBe('VALIDATION_ERROR')
  })

  it('executes transfer and publishes success response', async () => {
    mockExecuteTokenTransfer.mockResolvedValueOnce({
      txHash: '0x' + 'a'.repeat(64),
      blockNumber: 1000,
      gasUsed: '21000',
    })

    const channel = makeChannel()
    await startTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validTransferMessage))

    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('token.transfer.succeeded')
    expect(payload.result.txHash).toBe('0x' + 'a'.repeat(64))
  })

  it('publishes error when executeTokenTransfer throws', async () => {
    mockExecuteTokenTransfer.mockRejectedValueOnce(new Error('transfer reverted'))

    const channel = makeChannel()
    await startTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validTransferMessage))

    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('token.transfer.failed')
    expect(payload.error.code).toBe('EXECUTION_FAILED')
  })

  it('includes requester email in success response when provided', async () => {
    mockExecuteTokenTransfer.mockResolvedValueOnce({
      txHash: '0x' + 'c'.repeat(64),
      blockNumber: 2000,
      gasUsed: '21000',
    })

    const channel = makeChannel()
    await startTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validTransferMessage))

    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.requester.email).toBe('user@example.com')
  })

  it('omits requester email when not provided', async () => {
    mockExecuteTokenTransfer.mockResolvedValueOnce({
      txHash: '0x' + 'd'.repeat(64),
      blockNumber: 3000,
      gasUsed: '21000',
    })

    const msgWithoutEmail = {
      ...validTransferMessage,
      requester: { userId: 'user-002' },
    }

    const channel = makeChannel()
    await startTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(msgWithoutEmail))

    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(Object.prototype.hasOwnProperty.call(payload.requester, 'email')).toBe(false)
  })
})
