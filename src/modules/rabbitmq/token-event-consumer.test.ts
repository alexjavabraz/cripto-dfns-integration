import { describe, it, expect, vi, beforeEach } from 'vitest'
import type amqplib from 'amqplib'

vi.mock('../../config/env.js', () => ({
  env: {
    TOKEN_EVENT: 'token_event',
    QUEUE_TOKEN_EVENT: 'token_event.queue',
    EXCHANGE_TOKEN_EVENT_RESPONSE: 'token_event_response',
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

const { mockExecuteTokenOperation } = vi.hoisted(() => ({ mockExecuteTokenOperation: vi.fn() }))
vi.mock('../token/token-ops.js', () => ({
  executeTokenOperation: mockExecuteTokenOperation,
}))

const { mockGetNetworkConfig } = vi.hoisted(() => ({ mockGetNetworkConfig: vi.fn() }))
vi.mock('../token/networks.js', () => ({
  getNetworkConfig: mockGetNetworkConfig,
}))

import { startTokenEventConsumer } from './token-event-consumer.js'

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

const validTokenEvent = {
  event: 'token.event.requested',
  idempotencyKey: 'idem-event-001',
  timestamp: '2024-01-01T00:00:00.000Z',
  network: { name: 'ethereumsepolia', chainId: 11155111 },
  token: { address: validAddress, standard: 'ERC20' },
  operation: { type: 'mint', params: { to: validAddress, amount: '1000000000000000000' } },
  metadata: { requester: 'bff-service', correlationId: 'corr-001' },
}

describe('startTokenEventConsumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetNetworkConfig.mockReturnValue({ explorerUrl: 'https://sepolia.etherscan.io' })
  })

  it('starts consumer on correct queue', async () => {
    const channel = makeChannel()
    await startTokenEventConsumer(channel as unknown as amqplib.Channel)
    expect(channel.consume).toHaveBeenCalledWith('token_event.queue', expect.any(Function))
  })

  it('ignores null messages', async () => {
    const channel = makeChannel()
    await startTokenEventConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(null)
    expect(channel.ack).not.toHaveBeenCalled()
  })

  it('acks on invalid JSON', async () => {
    const channel = makeChannel()
    await startTokenEventConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg('not json {'))
    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).not.toHaveBeenCalled()
  })

  it('acks and publishes error for invalid schema', async () => {
    const channel = makeChannel()
    await startTokenEventConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg({ event: 'wrong.event' }))
    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('token.event.failed')
    expect(payload.error.code).toBe('VALIDATION_ERROR')
  })

  it('executes operation and publishes success response', async () => {
    mockExecuteTokenOperation.mockResolvedValueOnce({
      txHash: '0x' + 'a'.repeat(64),
      blockNumber: 1000,
      gasUsed: '100000',
    })

    const channel = makeChannel()
    await startTokenEventConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validTokenEvent))

    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('token.event.succeeded')
    expect(payload.operation.type).toBe('mint')
  })

  it('publishes error when executeTokenOperation throws', async () => {
    mockExecuteTokenOperation.mockRejectedValueOnce(new Error('mint failed: revert'))

    const channel = makeChannel()
    await startTokenEventConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validTokenEvent))

    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('token.event.failed')
    expect(payload.error.code).toBe('EXECUTION_FAILED')
    expect(payload.error.message).toContain('mint failed')
  })

  it('publishes correct routing key for success', async () => {
    mockExecuteTokenOperation.mockResolvedValueOnce({
      txHash: '0x' + 'b'.repeat(64),
      blockNumber: 2000,
      gasUsed: '50000',
    })

    const channel = makeChannel()
    await startTokenEventConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validTokenEvent))

    const [, routingKey] = channel.publish.mock.calls[0]!
    expect(routingKey).toBe('token.event.succeeded')
  })

  it('publishes correct routing key for failure', async () => {
    mockExecuteTokenOperation.mockRejectedValueOnce(new Error('fail'))

    const channel = makeChannel()
    await startTokenEventConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validTokenEvent))

    const [, routingKey] = channel.publish.mock.calls[0]!
    expect(routingKey).toBe('token.event.failed')
  })
})
