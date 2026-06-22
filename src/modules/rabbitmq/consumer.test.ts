import { describe, it, expect, vi, beforeEach } from 'vitest'
import type amqplib from 'amqplib'

vi.mock('../../config/env.js', () => ({
  env: {
    RABBITMQ_QUEUE: 'token.create',
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

const { mockProcessTokenMessage } = vi.hoisted(() => ({ mockProcessTokenMessage: vi.fn() }))
vi.mock('../token/processor.js', () => ({
  processTokenMessage: mockProcessTokenMessage,
}))

import { startConsumer } from './consumer.js'

function makeMsg(content: unknown, deathCount?: number): amqplib.Message {
  const headers: Record<string, unknown> = {}
  if (deathCount !== undefined) {
    headers['x-death'] = [{ count: deathCount }]
  }
  return {
    content: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)),
    properties: { headers },
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
    nack: vi.fn(),
    _triggerConsume: async (msg: amqplib.Message | null) => {
      if (consumeCallback) await consumeCallback(msg)
    },
  }
}

const validPayload = {
  type: 'ERC20',
  idempotencyKey: 'idem-001',
  timestamp: '2024-01-01T00:00:00.000Z',
  network: 'ethereumsepolia',
  name: 'BRL Token',
  symbol: 'BRLN',
  decimals: 18,
  supply: '1000',
  ownerAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
}

describe('startConsumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts consumer on the configured queue', async () => {
    const channel = makeChannel()
    await startConsumer(channel as unknown as amqplib.Channel)
    expect(channel.consume).toHaveBeenCalledWith('token.create', expect.any(Function))
  })

  it('ignores null messages (consumer cancelled)', async () => {
    const channel = makeChannel()
    await startConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(null)
    expect(channel.ack).not.toHaveBeenCalled()
    expect(channel.nack).not.toHaveBeenCalled()
  })

  it('acks on successful processing', async () => {
    mockProcessTokenMessage.mockResolvedValueOnce({
      contractAddress: '0xcontract',
      transactionHash: '0xtx',
      type: 'ERC20',
      network: 'ethereumsepolia',
    })

    const channel = makeChannel()
    await startConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validPayload))

    expect(channel.ack).toHaveBeenCalledOnce()
    expect(channel.nack).not.toHaveBeenCalled()
  })

  it('nacks (no requeue) on error when retry count < 3', async () => {
    mockProcessTokenMessage.mockRejectedValueOnce(new Error('deployment failed'))
    vi.useFakeTimers()

    const channel = makeChannel()
    await startConsumer(channel as unknown as amqplib.Channel)
    const triggerPromise = channel._triggerConsume(makeMsg(validPayload, 0))
    await vi.runAllTimersAsync()
    await triggerPromise

    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false)
    expect(channel.ack).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('nacks without backoff when retries exhausted (count >= 3)', async () => {
    mockProcessTokenMessage.mockRejectedValueOnce(new Error('still failing'))
    vi.useFakeTimers()

    const channel = makeChannel()
    await startConsumer(channel as unknown as amqplib.Channel)
    const triggerPromise = channel._triggerConsume(makeMsg(validPayload, 3))
    await vi.runAllTimersAsync()
    await triggerPromise

    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false)
    vi.useRealTimers()
  })

  it('throws and nacks on invalid JSON', async () => {
    vi.useFakeTimers()

    const channel = makeChannel()
    await startConsumer(channel as unknown as amqplib.Channel)
    const triggerPromise = channel._triggerConsume(makeMsg('bad json {'))
    await vi.runAllTimersAsync()
    await triggerPromise

    expect(channel.nack).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('reads x-death retry count from headers', async () => {
    mockProcessTokenMessage.mockRejectedValueOnce(new Error('error'))
    vi.useFakeTimers()

    const channel = makeChannel()
    await startConsumer(channel as unknown as amqplib.Channel)
    const triggerPromise = channel._triggerConsume(makeMsg(validPayload, 2))
    await vi.runAllTimersAsync()
    await triggerPromise

    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false)
    vi.useRealTimers()
  })
})
