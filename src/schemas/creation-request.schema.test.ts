import { describe, it, expect } from 'vitest'
import {
  creationRequestMessageSchema,
  creationSuccessEventSchema,
  creationErrorEventSchema,
} from './creation-request.schema.js'

const validAddress = '0xabcdef1234567890abcdef1234567890abcdef12'
const validNetwork = { name: 'ethereumsepolia', chainId: 11155111 }
const validMetadata = { requester: 'bff-service', correlationId: 'corr-001' }

describe('creationRequestMessageSchema', () => {
  describe('ERC20', () => {
    const validERC20 = {
      event: 'token.creation.requested',
      idempotencyKey: 'idem-001',
      timestamp: '2024-01-01T00:00:00.000Z',
      network: validNetwork,
      token: {
        standard: 'ERC20',
        name: 'BRL Token',
        symbol: 'BRLN',
        ownerAddress: validAddress,
      },
      params: {
        erc20: { decimals: 18, supply: '1000000000000000000000' },
      },
      metadata: validMetadata,
    }

    it('accepts a valid ERC20 creation request', () => {
      const result = creationRequestMessageSchema.safeParse(validERC20)
      expect(result.success).toBe(true)
    })

    it('requires event literal', () => {
      const result = creationRequestMessageSchema.safeParse({
        ...validERC20,
        event: 'token.creation.other',
      })
      expect(result.success).toBe(false)
    })

    it('requires idempotencyKey', () => {
      const { idempotencyKey: _idempotencyKey, ...rest } = validERC20
      const result = creationRequestMessageSchema.safeParse(rest)
      expect(result.success).toBe(false)
    })

    it('normalizes scientific notation supply', () => {
      const result = creationRequestMessageSchema.safeParse({
        ...validERC20,
        params: { erc20: { decimals: 18, supply: 1e22 } },
      })
      expect(result.success).toBe(true)
      if (result.success && result.data.params.erc20) {
        expect(result.data.params.erc20.supply).not.toContain('e')
      }
    })

    it('defaults erc20.decimals to 18', () => {
      const result = creationRequestMessageSchema.safeParse({
        ...validERC20,
        params: { erc20: { supply: '1000' } },
      })
      expect(result.success).toBe(true)
      if (result.success && result.data.params.erc20) {
        expect(result.data.params.erc20.decimals).toBe(18)
      }
    })

    it('rejects ownerAddress that is not a valid Ethereum address', () => {
      const result = creationRequestMessageSchema.safeParse({
        ...validERC20,
        token: { ...validERC20.token, ownerAddress: '0xBAD' },
      })
      expect(result.success).toBe(false)
    })

    it('requires requester in metadata', () => {
      const result = creationRequestMessageSchema.safeParse({
        ...validERC20,
        metadata: { correlationId: 'corr-001' },
      })
      expect(result.success).toBe(false)
    })

    it('requires correlationId in metadata', () => {
      const result = creationRequestMessageSchema.safeParse({
        ...validERC20,
        metadata: { requester: 'bff-service' },
      })
      expect(result.success).toBe(false)
    })
  })

  describe('ERC721', () => {
    const validERC721 = {
      event: 'token.creation.requested',
      idempotencyKey: 'idem-721',
      timestamp: '2024-01-01T00:00:00.000Z',
      network: validNetwork,
      token: {
        standard: 'ERC721',
        name: 'My NFT',
        symbol: 'NFT',
        ownerAddress: validAddress,
      },
      params: {
        erc721: { baseUri: 'https://example.com/nft/' },
      },
      metadata: validMetadata,
    }

    it('accepts a valid ERC721 creation request', () => {
      const result = creationRequestMessageSchema.safeParse(validERC721)
      expect(result.success).toBe(true)
    })

    it('accepts ERC721 without baseUri', () => {
      const result = creationRequestMessageSchema.safeParse({
        ...validERC721,
        params: { erc721: {} },
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid baseUri', () => {
      const result = creationRequestMessageSchema.safeParse({
        ...validERC721,
        params: { erc721: { baseUri: 'not-a-url' } },
      })
      expect(result.success).toBe(false)
    })
  })

  describe('ERC1155', () => {
    const validERC1155 = {
      event: 'token.creation.requested',
      idempotencyKey: 'idem-1155',
      timestamp: '2024-01-01T00:00:00.000Z',
      network: validNetwork,
      token: {
        standard: 'ERC1155',
        ownerAddress: validAddress,
      },
      params: {
        erc1155: { uri: 'https://example.com/token/{id}.json' },
      },
      metadata: validMetadata,
    }

    it('accepts a valid ERC1155 creation request', () => {
      const result = creationRequestMessageSchema.safeParse(validERC1155)
      expect(result.success).toBe(true)
    })

    it('requires erc1155.uri', () => {
      const result = creationRequestMessageSchema.safeParse({
        ...validERC1155,
        params: { erc1155: {} },
      })
      expect(result.success).toBe(false)
    })
  })

  describe('network validation', () => {
    const base = {
      event: 'token.creation.requested',
      idempotencyKey: 'idem-001',
      timestamp: '2024-01-01T00:00:00.000Z',
      token: {
        standard: 'ERC20',
        name: 'T',
        symbol: 'T',
        ownerAddress: validAddress,
      },
      params: { erc20: { supply: '1000' } },
      metadata: validMetadata,
    }

    it('rejects chainId < 0', () => {
      const result = creationRequestMessageSchema.safeParse({
        ...base,
        network: { name: 'test', chainId: -1 },
      })
      expect(result.success).toBe(false)
    })

    it('accepts chainId = 0', () => {
      const result = creationRequestMessageSchema.safeParse({
        ...base,
        network: { name: 'test', chainId: 0 },
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('creationSuccessEventSchema', () => {
  const validSuccess = {
    event: 'token.creation.succeeded',
    idempotencyKey: 'idem-001',
    timestamp: '2024-01-01T00:00:00.000Z',
    network: { name: 'ethereumsepolia', chainId: 11155111 },
    token: { standard: 'ERC20', name: 'BRL Token', symbol: 'BRLN', contractAddress: validAddress },
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

  it('accepts a valid success event', () => {
    const result = creationSuccessEventSchema.safeParse(validSuccess)
    expect(result.success).toBe(true)
  })

  it('rejects wrong event literal', () => {
    const result = creationSuccessEventSchema.safeParse({
      ...validSuccess,
      event: 'token.creation.failed',
    })
    expect(result.success).toBe(false)
  })
})

describe('creationErrorEventSchema', () => {
  const validError = {
    event: 'token.creation.failed',
    idempotencyKey: 'idem-001',
    timestamp: '2024-01-01T00:00:00.000Z',
    network: { name: 'ethereumsepolia', chainId: 11155111 },
    token: { standard: 'ERC20' },
    error: { code: 'NETWORK_ERROR', message: 'Connection refused', retryable: true },
    metadata: { correlationId: 'corr-001', processedBy: 'dfns-integration', durationMs: 100 },
  }

  it('accepts a valid error event', () => {
    const result = creationErrorEventSchema.safeParse(validError)
    expect(result.success).toBe(true)
  })

  it('accepts optional error.details', () => {
    const result = creationErrorEventSchema.safeParse({
      ...validError,
      error: { ...validError.error, details: 'ECONNREFUSED 127.0.0.1:5672' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects when retryable is missing', () => {
    const result = creationErrorEventSchema.safeParse({
      ...validError,
      error: { code: 'ERR', message: 'fail' },
    })
    expect(result.success).toBe(false)
  })
})
