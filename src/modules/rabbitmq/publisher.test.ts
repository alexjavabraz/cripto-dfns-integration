import { describe, it, expect, vi, beforeEach } from 'vitest'
import type amqplib from 'amqplib'

// Mock env
vi.mock('../../config/env.js', () => ({
  env: {
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

import { publishSuccess, publishError } from './publisher.js'
import type { CreationSuccessEvent, CreationErrorEvent } from '../../schemas/creation-request.schema.js'

const validAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

const successEvent: CreationSuccessEvent = {
  event: 'token.creation.succeeded',
  idempotencyKey: 'idem-001',
  timestamp: '2024-01-01T00:00:00.000Z',
  network: { name: 'ethereumsepolia', chainId: 11155111 },
  token: {
    standard: 'ERC20',
    name: 'BRL Token',
    symbol: 'BRLN',
    contractAddress: validAddress,
  },
  deployment: {
    contractAddress: validAddress,
    transactionHash: '0x' + 'a'.repeat(64),
    blockNumber: 1234567,
    deployerAddress: validAddress,
    gasUsed: '200000',
    effectiveGasPrice: '1000000000',
  },
  explorer: {
    transactionUrl: 'https://sepolia.etherscan.io/tx/0x' + 'a'.repeat(64),
    contractUrl: 'https://sepolia.etherscan.io/address/' + validAddress,
  },
  metadata: { correlationId: 'corr-001', processedBy: 'dfns-integration', durationMs: 5000 },
}

const errorEvent: CreationErrorEvent = {
  event: 'token.creation.failed',
  idempotencyKey: 'idem-002',
  timestamp: '2024-01-01T00:00:00.000Z',
  network: { name: 'ethereumsepolia', chainId: 11155111 },
  token: { standard: 'ERC20', name: 'Test', symbol: 'TST' },
  error: { code: 'NETWORK_ERROR', message: 'Connection refused', retryable: true },
  metadata: { correlationId: 'corr-002', processedBy: 'dfns-integration', durationMs: 100 },
}

describe('publishSuccess', () => {
  let mockChannel: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockChannel = { publish: vi.fn() }
  })

  it('calls channel.publish with correct exchange and routing key', () => {
    publishSuccess(mockChannel as unknown as amqplib.Channel, successEvent)

    expect(mockChannel.publish).toHaveBeenCalledOnce()
    const [exchange, routingKey] = mockChannel.publish.mock.calls[0]!
    expect(exchange).toBe('dfns_publish_token_creation_response')
    expect(routingKey).toBe('token.creation.succeeded')
  })

  it('publishes JSON-encoded event body', () => {
    publishSuccess(mockChannel as unknown as amqplib.Channel, successEvent)

    const buffer = mockChannel.publish.mock.calls[0]![2] as Buffer
    const parsed = JSON.parse(buffer.toString())
    expect(parsed.event).toBe('token.creation.succeeded')
    expect(parsed.idempotencyKey).toBe('idem-001')
    expect(parsed.network.name).toBe('ethereumsepolia')
  })

  it('publishes with persistent=true', () => {
    publishSuccess(mockChannel as unknown as amqplib.Channel, successEvent)

    const options = mockChannel.publish.mock.calls[0]![3] as { persistent: boolean }
    expect(options.persistent).toBe(true)
  })
})

describe('publishError', () => {
  let mockChannel: { publish: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockChannel = { publish: vi.fn() }
  })

  it('calls channel.publish with error exchange and routing key', () => {
    publishError(mockChannel as unknown as amqplib.Channel, errorEvent)

    expect(mockChannel.publish).toHaveBeenCalledOnce()
    const [exchange, routingKey] = mockChannel.publish.mock.calls[0]!
    expect(exchange).toBe('token_creation_error')
    expect(routingKey).toBe('token.creation.failed')
  })

  it('publishes JSON-encoded error event', () => {
    publishError(mockChannel as unknown as amqplib.Channel, errorEvent)

    const buffer = mockChannel.publish.mock.calls[0]![2] as Buffer
    const parsed = JSON.parse(buffer.toString())
    expect(parsed.event).toBe('token.creation.failed')
    expect(parsed.error.code).toBe('NETWORK_ERROR')
    expect(parsed.error.retryable).toBe(true)
  })

  it('publishes with persistent=true', () => {
    publishError(mockChannel as unknown as amqplib.Channel, errorEvent)

    const options = mockChannel.publish.mock.calls[0]![3] as { persistent: boolean }
    expect(options.persistent).toBe(true)
  })
})
