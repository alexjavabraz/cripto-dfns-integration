import { describe, it, expect, vi, beforeEach } from 'vitest'
import type amqplib from 'amqplib'

// Mock env
vi.mock('../../config/env.js', () => ({
  env: {
    QUEUE_GET_BALANCE: 'queue_get_balance',
    EXCHANGE_BALANCE_RESPONSE: 'balance_response',
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

const { mockGetERC20Balance } = vi.hoisted(() => ({ mockGetERC20Balance: vi.fn() }))
vi.mock('../token/balance.js', () => ({
  getERC20Balance: mockGetERC20Balance,
}))

import { startBalanceConsumer } from './balance-consumer.js'

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

const validBalanceRequest = {
  event: 'token.balance.requested',
  idempotencyKey: 'idem-balance-001',
  timestamp: '2024-01-01T00:00:00.000Z',
  network: { name: 'ethereumsepolia', chainId: 11155111 },
  token: { address: validAddress },
  wallet: { address: validAddress },
  metadata: { requester: 'bff-service', correlationId: 'corr-001' },
}

describe('startBalanceConsumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts consumer on correct queue', async () => {
    const channel = makeChannel()
    await startBalanceConsumer(channel as unknown as amqplib.Channel)
    expect(channel.consume).toHaveBeenCalledWith('queue_get_balance', expect.any(Function))
  })

  it('ignores null messages', async () => {
    const channel = makeChannel()
    await startBalanceConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(null)
    expect(channel.ack).not.toHaveBeenCalled()
  })

  it('acks on invalid JSON', async () => {
    const channel = makeChannel()
    await startBalanceConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg('not valid json {'))
    expect(channel.ack).toHaveBeenCalled()
  })

  it('acks and publishes error for invalid schema', async () => {
    const channel = makeChannel()
    await startBalanceConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg({ event: 'wrong.event' }))
    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('token.balance.failed')
    expect(payload.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns balance and publishes success response', async () => {
    mockGetERC20Balance.mockResolvedValueOnce({
      name: 'BRL Token',
      symbol: 'BRLN',
      decimals: 18,
      raw: '1000000000000000000000',
      formatted: '1000.0',
    })

    const channel = makeChannel()
    await startBalanceConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validBalanceRequest))

    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('token.balance.responded')
    expect(payload.balance.formatted).toBe('1000.0')
  })

  it('publishes error when getERC20Balance throws', async () => {
    mockGetERC20Balance.mockRejectedValueOnce(new Error('RPC connection refused'))

    const channel = makeChannel()
    await startBalanceConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validBalanceRequest))

    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('token.balance.failed')
    expect(payload.error.code).toBe('QUERY_FAILED')
  })
})
