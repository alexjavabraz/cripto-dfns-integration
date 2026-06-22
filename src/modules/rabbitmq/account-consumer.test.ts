import { describe, it, expect, vi, beforeEach } from 'vitest'
import type amqplib from 'amqplib'

vi.mock('../../config/env.js', () => ({
  env: {
    EXCHANGE_ACCOUNT_CREATE_REQUEST: 'bff_publish_account_create_request',
    QUEUE_ACCOUNT_CREATE_REQUEST: 'dfns_listen_account_create_request',
    EXCHANGE_ACCOUNT_CREATE_RESPONSE: 'dfns_publish_account_create_response',
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

const mockCreateWallet = vi.fn()
vi.mock('../dfns/client.js', () => ({
  getDfnsClient: vi.fn(() => ({
    wallets: { createWallet: mockCreateWallet },
  })),
}))

vi.mock('../token/gas-fund.js', () => ({
  sendGasToNewWallet: vi.fn().mockResolvedValue(undefined),
}))

import { startAccountConsumer } from './account-consumer.js'

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

const validAccountCreate = {
  event: 'account.create.requested',
  idempotencyKey: 'idem-account-001',
  requestedAt: '2024-01-01T00:00:00.000Z',
  userId: 'user-abc-123',
  network: 'EthereumSepolia',
}

describe('startAccountConsumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts consumer on correct queue', async () => {
    const channel = makeChannel()
    await startAccountConsumer(channel as unknown as amqplib.Channel)
    expect(channel.consume).toHaveBeenCalledWith(
      'dfns_listen_account_create_request',
      expect.any(Function),
    )
  })

  it('ignores null messages', async () => {
    const channel = makeChannel()
    await startAccountConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(null)
    expect(channel.ack).not.toHaveBeenCalled()
  })

  it('acks on invalid JSON', async () => {
    const channel = makeChannel()
    await startAccountConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg('invalid json {'))
    expect(channel.ack).toHaveBeenCalled()
  })

  it('acks and publishes error for invalid schema', async () => {
    const channel = makeChannel()
    await startAccountConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg({ event: 'wrong.event' }))
    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('account.create.failed')
    expect(payload.error.code).toBe('VALIDATION_ERROR')
  })

  it('creates wallet and publishes success response', async () => {
    mockCreateWallet.mockResolvedValueOnce({
      id: 'new-wallet-id',
      network: 'EthereumSepolia',
      address: '0xabcdef1234567890abcdef1234567890abcdef12',
    })

    const channel = makeChannel()
    await startAccountConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validAccountCreate))

    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('account.create.succeeded')
    expect(payload.wallet.id).toBe('new-wallet-id')
    expect(payload.userId).toBe('user-abc-123')
  })

  it('publishes error when createWallet throws', async () => {
    mockCreateWallet.mockRejectedValueOnce(new Error('DFNS wallet creation failed'))

    const channel = makeChannel()
    await startAccountConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validAccountCreate))

    expect(channel.ack).toHaveBeenCalled()
    expect(channel.publish).toHaveBeenCalledOnce()
    const payload = JSON.parse((channel.publish.mock.calls[0]![2] as Buffer).toString())
    expect(payload.event).toBe('account.create.failed')
    expect(payload.error.code).toBe('EXECUTION_FAILED')
    expect(payload.error.message).toContain('DFNS wallet creation failed')
  })

  it('does not trigger gas funding when wallet has no address', async () => {
    const { sendGasToNewWallet } = await import('../token/gas-fund.js')
    mockCreateWallet.mockResolvedValueOnce({
      id: 'new-wallet-no-addr',
      network: 'EthereumSepolia',
      address: undefined,
    })

    const channel = makeChannel()
    await startAccountConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg(validAccountCreate))

    expect(sendGasToNewWallet).not.toHaveBeenCalled()
  })

  it('triggers gas funding when wallet has an address', async () => {
    const { sendGasToNewWallet } = await import('../token/gas-fund.js')
    const walletAddress = '0xabcdef1234567890abcdef1234567890abcdef12'
    mockCreateWallet.mockResolvedValueOnce({
      id: 'wallet-with-addr',
      network: 'EthereumSepolia',
      address: walletAddress,
    })

    const channel = makeChannel()
    await startAccountConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg({ ...validAccountCreate, idempotencyKey: 'gas-test' }))

    // gas funding is async fire-and-forget, wait a tick
    await new Promise((r) => setTimeout(r, 10))
    expect(sendGasToNewWallet).toHaveBeenCalledWith(walletAddress, 'EthereumSepolia')
  })
})
