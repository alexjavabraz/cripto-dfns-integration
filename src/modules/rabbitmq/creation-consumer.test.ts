import { describe, it, expect, vi, beforeEach } from 'vitest'
import type amqplib from 'amqplib'

// Mock env
vi.mock('../../config/env.js', () => ({
  env: {
    QUEUE_REQUEST_TOKEN_CREATION: 'dfns_listen_token_creation_request',
    EXCHANGE_RESPONSE_TOKEN_CREATED: 'dfns_publish_token_creation_response',
    RABBITMQ_ERROR_EXCHANGE: 'token_creation_error',
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  },
}))

// Mock sentry
vi.mock('../../config/sentry.js', () => ({
  captureError: vi.fn(),
  captureMessage: vi.fn(),
  Sentry: { addBreadcrumb: vi.fn() },
}))

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const { mockIsValidNetwork } = vi.hoisted(() => ({ mockIsValidNetwork: vi.fn() }))
const { mockGetValidNetworks } = vi.hoisted(() => ({ mockGetValidNetworks: vi.fn() }))
vi.mock('../dfns/wallet-registry.js', () => ({
  isValidNetwork: mockIsValidNetwork,
  getValidNetworks: mockGetValidNetworks,
}))

const { mockGetNetworkConfig } = vi.hoisted(() => ({ mockGetNetworkConfig: vi.fn() }))
vi.mock('../token/networks.js', () => ({
  getNetworkConfig: mockGetNetworkConfig,
}))

const { mockProcessTokenMessage } = vi.hoisted(() => ({ mockProcessTokenMessage: vi.fn() }))
vi.mock('../token/processor.js', () => ({
  processTokenMessage: mockProcessTokenMessage,
}))

const { mockPublishSuccess } = vi.hoisted(() => ({ mockPublishSuccess: vi.fn() }))
const { mockPublishError } = vi.hoisted(() => ({ mockPublishError: vi.fn() }))
vi.mock('./publisher.js', () => ({
  publishSuccess: mockPublishSuccess,
  publishError: mockPublishError,
}))

import { startCreationConsumer } from './creation-consumer.js'

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
  const channel = {
    consume: vi.fn(async (queue: string, cb: (msg: amqplib.Message | null) => Promise<void>) => {
      consumeCallback = cb
    }),
    ack: vi.fn(),
    nack: vi.fn(),
    publish: vi.fn(),
    _triggerConsume: async (msg: amqplib.Message | null) => {
      if (consumeCallback) await consumeCallback(msg)
    },
  }
  return channel
}

const validCreationRequest = {
  event: 'token.creation.requested',
  idempotencyKey: `idem-${Date.now()}-${Math.random()}`,
  timestamp: '2024-01-01T00:00:00.000Z',
  network: { name: 'ethereumsepolia', chainId: 11155111 },
  token: {
    standard: 'ERC20',
    name: 'BRL Token',
    symbol: 'BRLN',
    ownerAddress: validAddress,
  },
  params: { erc20: { decimals: 18, supply: '1000000000000000000000' } },
  metadata: { requester: 'bff-service', correlationId: 'corr-001' },
}

describe('startCreationConsumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetValidNetworks.mockReturnValue(['ethereumsepolia'])
    mockGetNetworkConfig.mockReturnValue({
      explorerUrl: 'https://sepolia.etherscan.io',
      chainId: 11155111,
      walletId: 'wallet-001',
      walletAddress: validAddress,
      rpcUrl: 'https://rpc.example.com',
      dfnsNetworkId: 'EthereumSepolia',
    })
  })

  it('starts consumer on correct queue', async () => {
    const channel = makeChannel()
    await startCreationConsumer(channel as unknown as amqplib.Channel)
    expect(channel.consume).toHaveBeenCalledWith(
      'dfns_listen_token_creation_request',
      expect.any(Function),
    )
  })

  it('acks and ignores null messages', async () => {
    const channel = makeChannel()
    await startCreationConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(null)
    expect(channel.ack).not.toHaveBeenCalled()
    expect(channel.publish).not.toHaveBeenCalled()
  })

  it('acks and publishes error for non-JSON message', async () => {
    const channel = makeChannel()
    await startCreationConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg('not json {'))
    expect(channel.ack).toHaveBeenCalled()
    expect(mockPublishError).not.toHaveBeenCalled() // parse error before validation
  })

  it('acks and publishes error for invalid schema', async () => {
    const channel = makeChannel()
    await startCreationConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg({ event: 'wrong.event', foo: 'bar' }))
    expect(channel.ack).toHaveBeenCalled()
    expect(mockPublishError).toHaveBeenCalledOnce()
    const errorEvent = mockPublishError.mock.calls[0]![1]
    expect(errorEvent.error.code).toBe('VALIDATION_ERROR')
  })

  it('acks and publishes UNKNOWN_NETWORK error when network not registered', async () => {
    mockIsValidNetwork.mockReturnValueOnce(false)
    const channel = makeChannel()
    await startCreationConsumer(channel as unknown as amqplib.Channel)

    const msg = makeMsg({ ...validCreationRequest, idempotencyKey: `unique-${Date.now()}` })
    await channel._triggerConsume(msg)

    expect(channel.ack).toHaveBeenCalled()
    expect(mockPublishError).toHaveBeenCalledOnce()
    const errorEvent = mockPublishError.mock.calls[0]![1]
    expect(errorEvent.error.code).toBe('UNKNOWN_NETWORK')
  })

  it('processes valid message and publishes success', async () => {
    mockIsValidNetwork.mockReturnValueOnce(true)
    mockProcessTokenMessage.mockResolvedValueOnce({
      correlationId: 'corr-001',
      type: 'ERC20',
      network: 'ethereumsepolia',
      contractAddress: validAddress,
      transactionHash: '0x' + 'a'.repeat(64),
      deployedAt: new Date().toISOString(),
      blockNumber: 1000,
      gasUsed: '200000',
      effectiveGasPrice: '1000000000',
      deployerAddress: validAddress,
    })

    const uniqueKey = `success-key-${Date.now()}-${Math.random()}`
    const channel = makeChannel()
    await startCreationConsumer(channel as unknown as amqplib.Channel)
    await channel._triggerConsume(makeMsg({ ...validCreationRequest, idempotencyKey: uniqueKey }))

    expect(channel.ack).toHaveBeenCalled()
    expect(mockPublishSuccess).toHaveBeenCalledOnce()
    const successEvent = mockPublishSuccess.mock.calls[0]![1]
    expect(successEvent.event).toBe('token.creation.succeeded')
    expect(successEvent.deployment.contractAddress).toBe(validAddress)
  })

  it('publishes DUPLICATE_REQUEST error for repeated idempotency key', async () => {
    mockIsValidNetwork.mockReturnValue(true)
    mockProcessTokenMessage.mockResolvedValue({
      correlationId: 'corr-001',
      type: 'ERC20',
      network: 'ethereumsepolia',
      contractAddress: validAddress,
      transactionHash: '0x' + 'a'.repeat(64),
      deployedAt: new Date().toISOString(),
      blockNumber: 1000,
      gasUsed: '200000',
      effectiveGasPrice: '1000000000',
      deployerAddress: validAddress,
    })

    const duplicateKey = `dup-key-${Date.now()}-${Math.random()}`
    const channel = makeChannel()
    await startCreationConsumer(channel as unknown as amqplib.Channel)

    const msg = makeMsg({ ...validCreationRequest, idempotencyKey: duplicateKey })
    await channel._triggerConsume(msg)
    await channel._triggerConsume(msg)

    expect(mockPublishSuccess).toHaveBeenCalledTimes(1)
    expect(mockPublishError).toHaveBeenCalledTimes(1)
    const errorEvent = mockPublishError.mock.calls[0]![1]
    expect(errorEvent.error.code).toBe('DUPLICATE_REQUEST')
  })

  it('publishes error when processTokenMessage throws', async () => {
    mockIsValidNetwork.mockReturnValueOnce(true)
    mockProcessTokenMessage.mockRejectedValueOnce(new Error('dfns deployment failed'))

    const channel = makeChannel()
    await startCreationConsumer(channel as unknown as amqplib.Channel)
    const uniqueKey = `fail-key-${Date.now()}-${Math.random()}`
    await channel._triggerConsume(makeMsg({ ...validCreationRequest, idempotencyKey: uniqueKey }))

    expect(channel.ack).toHaveBeenCalled()
    expect(mockPublishError).toHaveBeenCalledOnce()
    const errorEvent = mockPublishError.mock.calls[0]![1]
    expect(errorEvent.event).toBe('token.creation.failed')
    expect(errorEvent.error.code).toBe('DEPLOYMENT_FAILED')
  })

  describe('categorizeError', () => {
    const cases: Array<[string, string, string]> = [
      ['Invalid token message: missing fields', 'VALIDATION_ERROR', 'validation error message'],
      ['validation schema error', 'VALIDATION_ERROR', 'validation keyword'],
      ['network connection failed', 'NETWORK_ERROR', 'network keyword'],
      ['rpc endpoint timeout', 'NETWORK_ERROR', 'rpc keyword'],
      ['ECONNREFUSED 127.0.0.1:5672', 'NETWORK_ERROR', 'econnrefused keyword'],
      ['dfns wallet not found', 'DEPLOYMENT_FAILED', 'dfns keyword'],
      ['broadcast failed', 'DEPLOYMENT_FAILED', 'broadcast keyword'],
      ['deploy execution reverted', 'DEPLOYMENT_FAILED', 'deploy keyword'],
      ['some random error', 'UNKNOWN_ERROR', 'unknown error'],
    ]

    for (const [errorMsg, expectedCode, description] of cases) {
      it(`categorizes "${description}" as ${expectedCode}`, async () => {
        mockIsValidNetwork.mockReturnValueOnce(true)
        mockProcessTokenMessage.mockRejectedValueOnce(new Error(errorMsg))

        const channel = makeChannel()
        await startCreationConsumer(channel as unknown as amqplib.Channel)
        const uniqueKey = `cat-key-${Date.now()}-${Math.random()}-${description}`
        await channel._triggerConsume(
          makeMsg({ ...validCreationRequest, idempotencyKey: uniqueKey }),
        )

        expect(mockPublishError).toHaveBeenCalled()
        const errorEvent = mockPublishError.mock.calls[0]![1]
        expect(errorEvent.error.code).toBe(expectedCode)
      })
    }
  })
})
