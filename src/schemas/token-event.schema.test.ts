import { describe, it, expect } from 'vitest'
import { tokenEventSchema } from './token-event.schema.js'

const validAddress = '0xabcdef1234567890abcdef1234567890abcdef12'
const validNetwork = { name: 'ethereumsepolia', chainId: 11155111 }
const validToken = { address: validAddress, standard: 'ERC20' as const }
const validMetadata = { requester: 'bff-service', correlationId: 'corr-001' }

const baseEvent = {
  event: 'token.event.requested',
  idempotencyKey: 'idem-event-001',
  timestamp: '2024-01-01T00:00:00.000Z',
  network: validNetwork,
  token: validToken,
  metadata: validMetadata,
}

describe('tokenEventSchema — mint', () => {
  it('accepts mint for ERC20', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      operation: { type: 'mint', params: { to: validAddress, amount: '1000000000000000000' } },
    })
    expect(result.success).toBe(true)
  })

  it('accepts mint for ERC721 (no amount required)', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      token: { address: validAddress, standard: 'ERC721' },
      operation: { type: 'mint', params: { to: validAddress } },
    })
    expect(result.success).toBe(true)
  })

  it('accepts mint for ERC1155 with tokenId and amount', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      token: { address: validAddress, standard: 'ERC1155' },
      operation: {
        type: 'mint',
        params: { to: validAddress, amount: '100', tokenId: '1', data: '0x' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('defaults mint data to 0x when absent', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      token: { address: validAddress, standard: 'ERC1155' },
      operation: { type: 'mint', params: { to: validAddress, amount: '100', tokenId: '1' } },
    })
    expect(result.success).toBe(true)
    if (result.success && result.data.operation.type === 'mint') {
      expect(result.data.operation.params.data).toBe('0x')
    }
  })

  it('rejects mint with invalid "to" address', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      operation: { type: 'mint', params: { to: 'not-an-address' } },
    })
    expect(result.success).toBe(false)
  })
})

describe('tokenEventSchema — burn', () => {
  it('accepts burn for ERC20', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      operation: {
        type: 'burn',
        params: { from: validAddress, amount: '1000000000000000000' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts burn for ERC721 with tokenId', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      token: { address: validAddress, standard: 'ERC721' },
      operation: { type: 'burn', params: { from: validAddress, tokenId: '42' } },
    })
    expect(result.success).toBe(true)
  })

  it('accepts burn for ERC1155 with tokenId and amount', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      token: { address: validAddress, standard: 'ERC1155' },
      operation: {
        type: 'burn',
        params: { from: validAddress, tokenId: '1', amount: '50' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects burn with invalid "from" address', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      operation: {
        type: 'burn',
        params: { from: 'not-an-address', amount: '100' },
      },
    })
    expect(result.success).toBe(false)
  })
})

describe('tokenEventSchema — pause / unpause', () => {
  it('accepts pause operation', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      operation: { type: 'pause' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts unpause operation', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      operation: { type: 'unpause' },
    })
    expect(result.success).toBe(true)
  })
})

describe('tokenEventSchema — validation', () => {
  it('requires event literal', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      event: 'other.event',
      operation: { type: 'pause' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown operation type', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      operation: { type: 'transfer' },
    })
    expect(result.success).toBe(false)
  })

  it('requires metadata.requester', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      metadata: { correlationId: 'corr-001' },
      operation: { type: 'pause' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects token.standard not in ERC20/ERC721/ERC1155', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      token: { address: validAddress, standard: 'ERC777' },
      operation: { type: 'pause' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects chainId < 0', () => {
    const result = tokenEventSchema.safeParse({
      ...baseEvent,
      network: { name: 'test', chainId: -1 },
      operation: { type: 'pause' },
    })
    expect(result.success).toBe(false)
  })
})
