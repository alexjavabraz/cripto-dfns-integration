import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock env
vi.mock('../../config/env.js', () => ({
  env: {
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

const { mockGetDfnsClient } = vi.hoisted(() => ({ mockGetDfnsClient: vi.fn() }))
vi.mock('../dfns/client.js', () => ({
  getDfnsClient: mockGetDfnsClient,
}))

const { mockGetNetworkConfig } = vi.hoisted(() => ({ mockGetNetworkConfig: vi.fn() }))
const { mockGetProvider } = vi.hoisted(() => ({ mockGetProvider: vi.fn() }))
vi.mock('./networks.js', () => ({
  getNetworkConfig: mockGetNetworkConfig,
  getProvider: mockGetProvider,
}))

const { mockDeployERC20 } = vi.hoisted(() => ({ mockDeployERC20: vi.fn() }))
const { mockDeployERC721 } = vi.hoisted(() => ({ mockDeployERC721: vi.fn() }))
const { mockDeployERC1155 } = vi.hoisted(() => ({ mockDeployERC1155: vi.fn() }))
vi.mock('./erc20.js', () => ({ deployERC20: mockDeployERC20 }))
vi.mock('./erc721.js', () => ({ deployERC721: mockDeployERC721 }))
vi.mock('./erc1155.js', () => ({ deployERC1155: mockDeployERC1155 }))

vi.mock('../dfns/signer.js', () => ({
  DfnsSigner: vi.fn().mockImplementation(() => ({})),
}))

import { processTokenMessage } from './processor.js'

const validAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

const mockDeploymentResult = {
  correlationId: 'corr-001',
  type: 'ERC20' as const,
  network: 'ethereumsepolia',
  contractAddress: validAddress,
  transactionHash: '0x' + 'a'.repeat(64),
  deployedAt: new Date().toISOString(),
  blockNumber: 1000,
  gasUsed: '200000',
  effectiveGasPrice: '1000000000',
  deployerAddress: validAddress,
}

const validERC20Message = {
  type: 'ERC20',
  idempotencyKey: 'idem-001',
  timestamp: '2024-01-01T00:00:00.000Z',
  network: 'ethereumsepolia',
  name: 'BRL Token',
  symbol: 'BRLN',
  decimals: 18,
  supply: '1000000000000000000000',
  ownerAddress: validAddress,
}

describe('processTokenMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDfnsClient.mockReturnValue({})
    mockGetNetworkConfig.mockReturnValue({
      walletId: 'wallet-001',
      explorerUrl: 'https://sepolia.etherscan.io',
      chainId: 11155111,
      walletAddress: validAddress,
      rpcUrl: 'https://rpc.example.com',
      dfnsNetworkId: 'EthereumSepolia',
    })
    mockGetProvider.mockReturnValue({})
  })

  it('throws for invalid payload (missing type)', async () => {
    await expect(processTokenMessage({ foo: 'bar' })).rejects.toThrow('Invalid token message')
  })

  it('throws for invalid payload (null)', async () => {
    await expect(processTokenMessage(null)).rejects.toThrow('Invalid token message')
  })

  it('throws for invalid payload (wrong event type)', async () => {
    await expect(processTokenMessage({ ...validERC20Message, type: 'ERC777' })).rejects.toThrow(
      'Invalid token message',
    )
  })

  it('processes ERC20 and returns deployment result', async () => {
    mockDeployERC20.mockResolvedValueOnce(mockDeploymentResult)

    const result = await processTokenMessage(validERC20Message)
    expect(result).toEqual(mockDeploymentResult)
    expect(mockDeployERC20).toHaveBeenCalledOnce()
  })

  it('processes ERC721 message', async () => {
    const erc721Result = { ...mockDeploymentResult, type: 'ERC721' as const }
    mockDeployERC721.mockResolvedValueOnce(erc721Result)

    const erc721Message = {
      type: 'ERC721',
      idempotencyKey: 'idem-721',
      timestamp: '2024-01-01T00:00:00.000Z',
      network: 'ethereumsepolia',
      name: 'My NFT',
      symbol: 'MNFT',
      ownerAddress: validAddress,
    }

    const result = await processTokenMessage(erc721Message)
    expect(result.type).toBe('ERC721')
    expect(mockDeployERC721).toHaveBeenCalledOnce()
  })

  it('processes ERC1155 message', async () => {
    const erc1155Result = { ...mockDeploymentResult, type: 'ERC1155' as const }
    mockDeployERC1155.mockResolvedValueOnce(erc1155Result)

    const erc1155Message = {
      type: 'ERC1155',
      idempotencyKey: 'idem-1155',
      timestamp: '2024-01-01T00:00:00.000Z',
      network: 'ethereumsepolia',
      ownerAddress: validAddress,
      metadata: { uri: 'https://example.com/token/{id}.json' },
    }

    const result = await processTokenMessage(erc1155Message)
    expect(result.type).toBe('ERC1155')
    expect(mockDeployERC1155).toHaveBeenCalledOnce()
  })

  it('re-throws errors from deployment', async () => {
    mockDeployERC20.mockRejectedValueOnce(new Error('Deployment failed: gas too low'))

    await expect(processTokenMessage(validERC20Message)).rejects.toThrow(
      'Deployment failed: gas too low',
    )
  })

  it('uses provided correlationId when present', async () => {
    mockDeployERC20.mockResolvedValueOnce(mockDeploymentResult)

    const messageWithCorrelation = {
      ...validERC20Message,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
    }
    await processTokenMessage(messageWithCorrelation)

    expect(mockDeployERC20).toHaveBeenCalledOnce()
    const [calledMessage] = mockDeployERC20.mock.calls[0]!
    expect(calledMessage.correlationId).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('generates correlationId when not provided', async () => {
    mockDeployERC20.mockResolvedValueOnce(mockDeploymentResult)

    await processTokenMessage(validERC20Message)

    const [calledMessage] = mockDeployERC20.mock.calls[0]!
    expect(calledMessage.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('re-throws errors with httpStatus detail', async () => {
    const httpError = Object.assign(new Error('DFNS HTTP error'), {
      httpStatus: 401,
      context: { detail: 'Unauthorized' },
    })
    mockDeployERC20.mockRejectedValueOnce(httpError)

    await expect(processTokenMessage(validERC20Message)).rejects.toThrow('DFNS HTTP error')
  })
})
