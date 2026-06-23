import { describe, it, expect } from 'vitest'
import { tokenMessageSchema, TokenType } from './token.schema.js'

const baseFields = {
  idempotencyKey: 'idem-001',
  timestamp: '2024-01-01T00:00:00.000Z',
  network: 'ethereumsepolia',
}

describe('TokenType enum', () => {
  it('accepts ERC20', () => {
    const result = TokenType.safeParse('ERC20')
    expect(result.success).toBe(true)
  })

  it('accepts ERC721', () => {
    const result = TokenType.safeParse('ERC721')
    expect(result.success).toBe(true)
  })

  it('accepts ERC1155', () => {
    const result = TokenType.safeParse('ERC1155')
    expect(result.success).toBe(true)
  })

  it('rejects unknown type', () => {
    const result = TokenType.safeParse('ERC777')
    expect(result.success).toBe(false)
  })
})

describe('tokenMessageSchema — ERC20', () => {
  const validERC20 = {
    ...baseFields,
    type: 'ERC20',
    name: 'BRL Token',
    symbol: 'BRLN',
    decimals: 18,
    supply: '1000000000000000000000',
    ownerAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  }

  it('accepts a valid ERC20 message', () => {
    const result = tokenMessageSchema.safeParse(validERC20)
    expect(result.success).toBe(true)
  })

  it('converts symbol to uppercase', () => {
    const result = tokenMessageSchema.safeParse({ ...validERC20, symbol: 'brln' })
    expect(result.success).toBe(true)
    if (result.success && result.data.type === 'ERC20') {
      expect(result.data.symbol).toBe('BRLN')
    }
  })

  it('defaults decimals to 18', () => {
    const { decimals, ...rest } = validERC20
    const result = tokenMessageSchema.safeParse(rest)
    expect(result.success).toBe(true)
    if (result.success && result.data.type === 'ERC20') {
      expect(result.data.decimals).toBe(18)
    }
  })

  it('normalizes scientific notation supply', () => {
    const result = tokenMessageSchema.safeParse({ ...validERC20, supply: 1e22 })
    expect(result.success).toBe(true)
    if (result.success && result.data.type === 'ERC20') {
      expect(result.data.supply).not.toContain('e')
      expect(result.data.supply).not.toContain('E')
    }
  })

  it('rejects missing name', () => {
    const { name, ...rest } = validERC20
    const result = tokenMessageSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects missing symbol', () => {
    const { symbol, ...rest } = validERC20
    const result = tokenMessageSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects missing ownerAddress', () => {
    const { ownerAddress, ...rest } = validERC20
    const result = tokenMessageSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects invalid ownerAddress', () => {
    const result = tokenMessageSchema.safeParse({ ...validERC20, ownerAddress: '0xINVALID' })
    expect(result.success).toBe(false)
  })

  it('rejects decimals > 18', () => {
    const result = tokenMessageSchema.safeParse({ ...validERC20, decimals: 19 })
    expect(result.success).toBe(false)
  })

  it('rejects name longer than 64 chars', () => {
    const result = tokenMessageSchema.safeParse({ ...validERC20, name: 'A'.repeat(65) })
    expect(result.success).toBe(false)
  })

  it('rejects symbol longer than 11 chars', () => {
    const result = tokenMessageSchema.safeParse({ ...validERC20, symbol: 'A'.repeat(12) })
    expect(result.success).toBe(false)
  })

  it('accepts optional correlationId as UUID', () => {
    const result = tokenMessageSchema.safeParse({
      ...validERC20,
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid correlationId (not UUID)', () => {
    const result = tokenMessageSchema.safeParse({ ...validERC20, correlationId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })
})

describe('tokenMessageSchema — ERC721', () => {
  const validERC721 = {
    ...baseFields,
    type: 'ERC721',
    name: 'My NFT Collection',
    symbol: 'MNC',
    ownerAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  }

  it('accepts a valid ERC721 message', () => {
    const result = tokenMessageSchema.safeParse(validERC721)
    expect(result.success).toBe(true)
  })

  it('accepts optional metadata.uri', () => {
    const result = tokenMessageSchema.safeParse({
      ...validERC721,
      metadata: { uri: 'https://example.com/metadata/' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects metadata.uri that is not a URL', () => {
    const result = tokenMessageSchema.safeParse({
      ...validERC721,
      metadata: { uri: 'not-a-url' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts absent metadata', () => {
    const result = tokenMessageSchema.safeParse(validERC721)
    expect(result.success).toBe(true)
  })

  it('rejects missing name for ERC721', () => {
    const { name, ...rest } = validERC721
    const result = tokenMessageSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })
})

describe('tokenMessageSchema — ERC1155', () => {
  const validERC1155 = {
    ...baseFields,
    type: 'ERC1155',
    ownerAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
    metadata: { uri: 'https://example.com/token/{id}.json' },
  }

  it('accepts a valid ERC1155 message', () => {
    const result = tokenMessageSchema.safeParse(validERC1155)
    expect(result.success).toBe(true)
  })

  it('rejects missing metadata.uri', () => {
    const result = tokenMessageSchema.safeParse({
      ...validERC1155,
      metadata: {},
    })
    expect(result.success).toBe(false)
  })

  it('rejects metadata.uri that is not a URL', () => {
    const result = tokenMessageSchema.safeParse({
      ...validERC1155,
      metadata: { uri: "not-a-url-at-all-!!!" },
    })
    
    expect(result.success).toBe(false)
  })

  it('rejects missing ownerAddress', () => {
    const { ownerAddress, ...rest } = validERC1155
    const result = tokenMessageSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })
})
