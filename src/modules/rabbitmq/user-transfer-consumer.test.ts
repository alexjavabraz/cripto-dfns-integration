import { describe, it, expect, vi, beforeEach } from 'vitest'
import type amqplib from 'amqplib'

vi.mock('../../config/env.js', () => ({
  env: {
    EXCHANGE_USER_TRANSFER_REQUEST: 'bff_publish_user_transfer_request',
    QUEUE_USER_TRANSFER_REQUEST: 'dfns_listen_user_transfer_request',
    EXCHANGE_USER_TRANSFER_RESPONSE: 'dfns_publish_user_transfer_response',
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

import { startUserTransferConsumer } from './user-transfer-consumer.js'

const validAddress = '0xabcdef1234567890abcdef1234567890abcdef12'
const anotherAddress = '0x1234567890abcdef1234567890abcdef12345678'

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
    assertExchange: vi.fn().mockResolvedValue(undefined),
    assertQueue: vi.fn().mockResolvedValue(undefined),
    bindQueue: vi.fn().mockResolvedValue(undefined),
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

const validUserTransfer = {
  event: 'user.transfer.approved',
  requestId: 'req-001',
  userId: 'user-abc-123',
  userWalletId: 'wallet-user-001',
  fromAddress: validAddress,
  toAddress: anotherAddress,
  contractAddress: validAddress,
  network: 'ethereumsepolia',
  amount: '100',
  decimals: 18,
  metadata: { correlationId: 'corr-001' },
}

describe('startUserTransferConsumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('asserts exchange, queue, and binding on startup', async () => {
    const channel = makeChannel()
    await startUserTransferConsumer(channel as unknown as amqplib.Channel)
    expect(channel.assertExchange).toHaveBeenCalledWith(
      'bff_publish_user_transfer_request',
      'topic',
      { durable: true },
    )
    expect(channel.assertQueue).toHaveBeenCalledWith('dfns_listen_user_transfer_request', {
      durable: true,
    })
    expect(channel.bindQueue).toHaveBeenCalled()
  })

  it('starts consumer on correct queue', async () => {
    const channel = makeChannel()
    await startUserTransferConsumer(channel as unknown as amqplib.Channel)
    expect(channel.consume).toHaveBeenCalledWith(
      'dfns_listen_user_transfer_request',
      expect.any(Function),
    )
  })

  it('ignores null messages', async () => {
    const channel = makeChannel()
    await startUserTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(null)
    expect(channel.ack).not.toHaveBeenCalled()
  })

  it('acks on invalid JSON', async () => {
    const channel = makeChannel()
    await startUserTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg('bad json {'))
    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).not.toHaveBeenCalled()
  })

  it('acks and publishes error for invalid schema', async () => {
    const channel = makeChannel()
    await startUserTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg({ event: 'user.transfer.approved', foo: 'bar' }))
    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('user.transfer.failed')
    expect(payload.error.code).toBe('VALIDATION_ERROR')
  })

  it('executes transfer using userWalletId and publishes success', async () => {
    mockExecuteTokenTransfer.mockResolvedValueOnce({
      txHash: '0x' + 'a'.repeat(64),
      blockNumber: 5000,
      gasUsed: '21000',
    })

    const channel = makeChannel()
    await startUserTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validUserTransfer))

    expect(channel.ack).toHaveBeenCalled()
    // Verify userWalletId is passed as second arg to executeTokenTransfer
    expect(mockExecuteTokenTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ network: 'ethereumsepolia' }),
      'wallet-user-001',
    )

    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('user.transfer.completed')
    expect(payload.requestId).toBe('req-001')
    expect(payload.userId).toBe('user-abc-123')
  })

  it('publishes error when transfer fails', async () => {
    mockExecuteTokenTransfer.mockRejectedValueOnce(new Error('insufficient balance'))

    const channel = makeChannel()
    await startUserTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validUserTransfer))

    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('user.transfer.failed')
    expect(payload.error.code).toBe('EXECUTION_FAILED')
    expect(payload.error.message).toContain('insufficient balance')
  })

  it('includes correlationId in response when present', async () => {
    mockExecuteTokenTransfer.mockResolvedValueOnce({
      txHash: '0x' + 'b'.repeat(64),
      blockNumber: 6000,
      gasUsed: '21000',
    })

    const channel = makeChannel()
    await startUserTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validUserTransfer))

    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.metadata.correlationId).toBe('corr-001')
  })

  it('omits correlationId in response when not provided', async () => {
    mockExecuteTokenTransfer.mockResolvedValueOnce({
      txHash: '0x' + 'c'.repeat(64),
      blockNumber: 7000,
      gasUsed: '21000',
    })

    const msgNoMeta = { ...validUserTransfer, metadata: undefined }
    const channel = makeChannel()
    await startUserTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(msgNoMeta))

    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(Object.prototype.hasOwnProperty.call(payload.metadata, 'correlationId')).toBe(false)
  })

  it('publishes to correct routing key for success', async () => {
    mockExecuteTokenTransfer.mockResolvedValueOnce({
      txHash: '0x' + 'd'.repeat(64),
      blockNumber: 8000,
      gasUsed: '21000',
    })

    const channel = makeChannel()
    await startUserTransferConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg({ ...validUserTransfer, requestId: 'req-routing-test' }))

    const [, routingKey] = channel.publish.mock.calls[0]!
    expect(routingKey).toBe('user.transfer.completed')
  })
})
